import { getStore } from '@netlify/blobs';
import { endpoint, json, fail, verifyToken, mergeRecords } from './lib/common.mjs';

export const config = { path: '/api/sync' };

const ENTITLEMENT = 'roster';

// Storage is only for paying users; the client gate alone would let anyone
// with devtools fill it.
async function assertPremium(userId) {
    const key = process.env.RC_SECRET_KEY;
    if (!key) return;
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

export default endpoint(async (req) => {
    const { userId } = verifyToken(req);
    await assertPremium(userId);

    const body = await req.json().catch(() => ({}));
    const since = typeof body.since === 'string' ? body.since : '';
    const incoming = {
        students: isArray(body.students) ? body.students : [],
        sessions: isArray(body.sessions) ? body.sessions : [],
    };
    if (incoming.students.length + incoming.sessions.length > 5000) throw fail(413, 'Too many records in one sync');

    // Deltas are cut on server time (syncedAt), not the record's updatedAt,
    // so a device with a slow clock can't push a change that other devices
    // then never see.
    const now = new Date().toISOString();
    [...incoming.students, ...incoming.sessions].forEach((r) => { if (r) r.syncedAt = now; });

    const store = getStore({ name: 'rosters', consistency: 'strong' });
    const saved = (await store.get(userId, { type: 'json' })) || { students: [], sessions: [] };
    const changed = mergeRecords(saved.students, incoming.students) + mergeRecords(saved.sessions, incoming.sessions);
    if (changed > 0) await store.setJSON(userId, saved);

    const after = (r) => !since || (r.syncedAt || '') > since;
    return json(req, 200, {
        now,
        students: saved.students.filter(after),
        sessions: saved.sessions.filter(after),
    });
});
