import { endpoint, json, authenticate, saveAccount, stores } from './lib/common.mjs';

export const config = { path: '/api/account-delete' };

// Revoke first, then remove the roster: any token issued before this moment
// is refused from here on, so another device or an in-flight sync can't
// write the roster back. The account record itself is kept as a tombstone;
// signing in again with the same email starts a fresh, empty roster.
export default endpoint(async (req, context) => {
    const s = stores(context);
    const auth = await authenticate(req, s);
    const now = Date.now();
    auth.account.tokensValidAfter = now;
    auth.account.deletedAt = new Date(now).toISOString();
    auth.account.premium = null;
    await saveAccount(auth.account, s);
    await s.rosters.delete(auth.userId);
    return json(req, 200, { ok: true });
});
