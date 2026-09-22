import { endpoint, json, fail, normalizeEmail, consumeCode, reviewerCodeMatches, resolveAccount, issueToken, stores } from './lib/common.mjs';

// Codes are six digits and single-use with a five-guess lockout; the per-IP
// limit is a second layer on top of that.
export const config = {
    path: '/api/auth-verify',
    rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' },
};

export default endpoint(async (req, context) => {
    const s = stores(context);
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!reviewerCodeMatches(email, body.code) && !(await consumeCode(email, body.code, s))) {
        throw fail(401, 'That code is wrong or has expired');
    }
    const { account } = await resolveAccount(email, s);
    return json(req, 200, { userId: account.userId, email, token: issueToken(account.userId, email) });
});
