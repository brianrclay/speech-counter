import { endpoint, json, fail, verifyToken, emailKey, stores } from './lib/common.mjs';

export const config = { path: '/api/account-delete' };

// Keep only a revocation tombstone. Remove the email lookup and personal
// data, so signing up again creates a new account. A valid old token may
// retry deletion after a partial storage failure, but cannot use other APIs.
export async function deleteAccount(claims, s) {
    const found = await s.accounts.getWithMetadata(claims.userId, { type: 'json' });
    const account = found && found.data;
    if (!account || (!account.deletedAt && claims.issuedAt < (account.tokensValidAfter || 0))) {
        throw fail(401, 'Sign in to continue');
    }
    const now = Date.now();
    await s.accounts.setJSON(claims.userId, {
        userId: claims.userId,
        tokensValidAfter: now,
        deletedAt: account.deletedAt || new Date(now).toISOString(),
    });
    await s.rosters.delete(claims.userId);
    const key = emailKey(claims.email);
    const index = await s.accounts.get(key, { type: 'json' });
    if (index && index.userId === claims.userId) {
        await s.codes.delete(key);
        await s.accounts.delete(key);
    }
}

export default endpoint(async (req, context) => {
    const s = stores(context);
    await deleteAccount(verifyToken(req), s);
    return json(req, 200, { ok: true });
});
