import { endpoint, json, fail, authenticate, assertPremium, stores } from './lib/common.mjs';

export const config = { path: '/api/sync' };

// The roster is one blob per account: { rev, students, sessions }. Every
// write bumps rev and stamps it on the records it changed, and the write is
// conditional on the blob's ETag, so two devices syncing at once can't
// overwrite each other and the cursor a client gets back always matches a
// committed snapshot. Clients page through changes with `since` (a rev).
const MAX_INCOMING = 2000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ROSTER = 20000;
const PAGE_SIZE = 2000;
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const WRITE_RETRIES = 5;
const MAX_TEXT = 200;

const isArray = (v) => Array.isArray(v);
const id = (v) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);
const text = (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
const isoOrNull = (v) => {
    if (typeof v !== 'string' || !v) return null;
    const date = new Date(v);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 1000000 ? v : 0);

// A device clock set far in the future would otherwise win every merge
// forever; cap updatedAt at "now" plus a little skew.
function clampedStamp(v, now) {
    const stamp = isoOrNull(v);
    if (!stamp) return null;
    return new Date(stamp).getTime() > now + CLOCK_SKEW_MS ? new Date(now).toISOString() : stamp;
}

// Records are stored as sent, so pin them to the shapes store.js creates:
// known fields only, bounded strings, real dates, non-negative counts. A
// deleted record keeps only what's needed to propagate the deletion.
function cleanStudent(r, now) {
    const rid = r && id(r.id);
    if (!rid) return null;
    const deletedAt = clampedStamp(r.deletedAt, now);
    return {
        id: rid,
        name: deletedAt ? '' : text(r.name),
        nameKey: deletedAt ? '' : text(r.nameKey),
        createdAt: isoOrNull(r.createdAt),
        updatedAt: clampedStamp(r.updatedAt, now),
        deletedAt,
    };
}

function cleanSession(r, now) {
    const rid = r && id(r.id);
    const studentId = r && id(r.studentId);
    if (!rid || !studentId) return null;
    const deletedAt = clampedStamp(r.deletedAt, now);
    return {
        id: rid,
        studentId,
        target: deletedAt ? '' : text(r.target),
        correct: deletedAt ? 0 : count(r.correct),
        incorrect: deletedAt ? 0 : count(r.incorrect),
        startedAt: isoOrNull(r.startedAt),
        createdAt: isoOrNull(r.createdAt),
        updatedAt: clampedStamp(r.updatedAt, now),
        deletedAt,
    };
}

// Last-write-wins by updatedAt; changed records get the new rev.
function merge(into, incoming, rev) {
    const index = new Map(into.map((r, i) => [r.id, i]));
    let changed = 0;
    incoming.forEach((record) => {
        const at = index.get(record.id);
        if (at === undefined) {
            index.set(record.id, into.length);
            into.push({ ...record, rev });
            changed += 1;
        } else if ((record.updatedAt || '') > (into[at].updatedAt || '')) {
            into[at] = { ...record, rev };
            changed += 1;
        }
    });
    return changed;
}

// Tombstones only need to outlive any device that might still hold the
// record; after that they're dropped so a small roster can't fill the limit.
function compact(list, now) {
    return list.filter((r) => !r.deletedAt || now - new Date(r.deletedAt).getTime() < TOMBSTONE_TTL_MS);
}

function normalizeRoster(saved) {
    const roster = saved && typeof saved === 'object' ? saved : {};
    return {
        rev: Number.isInteger(roster.rev) ? roster.rev : 0,
        students: isArray(roster.students) ? roster.students : [],
        sessions: isArray(roster.sessions) ? roster.sessions : [],
    };
}

export default endpoint(async (req, context) => {
    const s = stores(context);
    const auth = await authenticate(req, s);
    await assertPremium(auth, s);

    if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw fail(413, 'That sync is too large');
    const body = await req.json().catch(() => ({}));
    const since = Number.isInteger(body.since) && body.since >= 0 ? body.since : 0;
    const rawStudents = isArray(body.students) ? body.students : [];
    const rawSessions = isArray(body.sessions) ? body.sessions : [];
    if (rawStudents.length + rawSessions.length > MAX_INCOMING) throw fail(413, 'Too many records in one sync');
    const nowMs = Date.now();
    const incoming = {
        students: rawStudents.map((r) => cleanStudent(r, nowMs)).filter(Boolean),
        sessions: rawSessions.map((r) => cleanSession(r, nowMs)).filter(Boolean),
    };

    let roster = null;
    for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
        const found = await s.rosters.getWithMetadata(auth.userId, { type: 'json' });
        roster = normalizeRoster(found && found.data);
        if (incoming.students.length + incoming.sessions.length === 0) break;

        const next = roster.rev + 1;
        const changed = merge(roster.students, incoming.students, next) + merge(roster.sessions, incoming.sessions, next);
        if (changed === 0) break;
        roster.rev = next;
        roster.students = compact(roster.students, nowMs);
        roster.sessions = compact(roster.sessions, nowMs);
        if (roster.students.length + roster.sessions.length > MAX_ROSTER) throw fail(413, 'This roster is too large to sync');

        const condition = found ? { onlyIfMatch: found.etag } : { onlyIfNew: true };
        const { modified } = await s.rosters.setJSON(auth.userId, roster, condition);
        if (modified) break;
        roster = null;
    }
    if (!roster) throw fail(503, 'The roster is busy syncing from another device. Try again');

    // Deletion may have happened while this sync was writing. Remove any
    // late write and reject the old token before returning personal data.
    try {
        await authenticate(req, s);
    } catch (err) {
        if (err.status === 401) {
            const current = await s.accounts.get(auth.userId, { type: 'json' });
            if (!current || current.deletedAt) await s.rosters.delete(auth.userId);
        }
        throw err;
    }

    // Changes after the client's cursor, oldest first, one page at a time.
    const changedSince = (list) => list.filter((r) => (r.rev || 0) > since);
    const page = [...changedSince(roster.students).map((r) => ({ kind: 's', r })), ...changedSince(roster.sessions).map((r) => ({ kind: 'x', r }))]
        .sort((a, b) => (a.r.rev || 0) - (b.r.rev || 0));
    const more = page.length > PAGE_SIZE;
    const slice = more ? page.slice(0, PAGE_SIZE) : page;
    const cursor = more ? slice[slice.length - 1].r.rev : roster.rev;
    // Never split one rev across pages: a partial rev would be skipped next
    // time. If the whole page is one rev, send that rev complete instead.
    let safe = more ? slice.filter((e) => (e.r.rev || 0) < cursor) : slice;
    let rev = more ? cursor - 1 : cursor;
    if (more && safe.length === 0) {
        safe = page.filter((e) => (e.r.rev || 0) === cursor);
        rev = cursor;
    }
    return json(req, 200, {
        rev,
        more,
        students: safe.filter((e) => e.kind === 's').map((e) => e.r),
        sessions: safe.filter((e) => e.kind === 'x').map((e) => e.r),
    });
});
