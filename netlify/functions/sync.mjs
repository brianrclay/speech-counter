import { getStore } from '@netlify/blobs';
import { endpoint, json, fail, env, verifyToken, mergeRecords } from './lib/common.mjs';

export const config = { path: '/api/sync' };

const ENTITLEMENT = 'roster';

// Storage is only for paying users; the client gate alone would let anyone
// with devtools fill it. A missing key fails closed rather than open.
async function assertPremium(userId) {
    const key = env('RC_SECRET_KEY');
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!response.ok) {
        console.error('RevenueCat error', response.status, await response.text());
        throw fail(502, 'Could not check your subscription right now');
    }
    const data = await response.json();
    const entitlement = data.subscriber && data.subscriber.entitlements && data.subscriber.entitlements[ENTITLEMENT];
    const active = entitlement && (!entitlement.expires_date || new Date(entitlement.expires_date) > new Date());
    if (!active) throw fail(402, 'Sync needs an active Speech Count Pro purchase');
}

const isArray = (v) => Array.isArray(v);

// Records are stored as sent, so pin them to the shapes store.js creates:
// known fields only, bounded strings, real dates, and non-negative counts.
// Anything else is dropped rather than persisted for every other device.
const MAX_TEXT = 200;
const MAX_ROSTER = 20000;

const id = (v) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);
const text = (v) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');
const isoOrNull = (v) => {
    if (typeof v !== 'string' || !v) return null;
    const date = new Date(v);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 1000000 ? v : 0);

function cleanStudent(r) {
    const rid = r && id(r.id);
    if (!rid) return null;
    return {
        id: rid,
        name: text(r.name),
        nameKey: text(r.nameKey),
        createdAt: isoOrNull(r.createdAt),
        updatedAt: isoOrNull(r.updatedAt),
        deletedAt: isoOrNull(r.deletedAt),
    };
}

function cleanSession(r) {
    const rid = r && id(r.id);
    const studentId = r && id(r.studentId);
    if (!rid || !studentId) return null;
    return {
        id: rid,
        studentId,
        target: text(r.target),
        correct: count(r.correct),
        incorrect: count(r.incorrect),
        startedAt: isoOrNull(r.startedAt),
        createdAt: isoOrNull(r.createdAt),
        updatedAt: isoOrNull(r.updatedAt),
        deletedAt: isoOrNull(r.deletedAt),
    };
}

export default endpoint(async (req) => {
    const { userId } = verifyToken(req);
    await assertPremium(userId);

    const body = await req.json().catch(() => ({}));
    const since = typeof body.since === 'string' ? body.since.slice(0, 40) : '';
    const rawStudents = isArray(body.students) ? body.students : [];
    const rawSessions = isArray(body.sessions) ? body.sessions : [];
    if (rawStudents.length + rawSessions.length > 5000) throw fail(413, 'Too many records in one sync');
    const incoming = {
        students: rawStudents.map(cleanStudent).filter(Boolean),
        sessions: rawSessions.map(cleanSession).filter(Boolean),
    };

    // Deltas are cut on server time (syncedAt), not the record's updatedAt,
    // so a device with a slow clock can't push a change that other devices
    // then never see.
    const now = new Date().toISOString();
    [...incoming.students, ...incoming.sessions].forEach((r) => { if (r) r.syncedAt = now; });

    const store = getStore({ name: 'rosters', consistency: 'strong' });
    const saved = (await store.get(userId, { type: 'json' })) || { students: [], sessions: [] };
    const changed = mergeRecords(saved.students, incoming.students) + mergeRecords(saved.sessions, incoming.sessions);
    if (saved.students.length + saved.sessions.length > MAX_ROSTER) throw fail(413, 'This roster is too large to sync');
    if (changed > 0) await store.setJSON(userId, saved);

    const after = (r) => !since || (r.syncedAt || '') > since;
    return json(req, 200, {
        now,
        students: saved.students.filter(after),
        sessions: saved.sessions.filter(after),
    });
});
