import { endpoint, json, authenticate, redeemCoupon, saveAccount, stores } from './lib/common.mjs';

export const config = {
    path: '/api/redeem-code',
    rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' },
};

export default endpoint(async (req, context) => {
    const s = stores(context);
    const auth = await authenticate(req, s);
    const body = await req.json().catch(() => ({}));
    const grant = await redeemCoupon(auth.userId, body.code, s);
    // Force the next sync (or this session's own refresh) to recheck
    // RevenueCat instead of trusting the ten-minute "not premium" cache.
    auth.account.premium = null;
    await saveAccount(auth.account, s, auth.etag);
    return json(req, 200, { ok: true, grant });
});
