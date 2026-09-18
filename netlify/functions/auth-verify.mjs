import { endpoint, json, fail, normalizeEmail, codeMatches, isReviewer, userIdFor, issueToken } from './lib/common.mjs';

// Codes are six digits and valid for two ten-minute windows; without a cap
// on attempts they could be brute-forced, and a guessed code opens the
// account's roster.
export const config = {
    path: '/api/auth-verify',
    rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' },
};

export default endpoint(async (req) => {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!isReviewer(email, body.code) && !codeMatches(email, body.code)) {
        throw fail(401, 'That code is wrong or has expired');
    }
    const userId = userIdFor(email);
    return json(req, 200, { userId, email, token: issueToken(userId, email) });
});
