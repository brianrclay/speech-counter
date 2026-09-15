import { endpoint, json, fail, normalizeEmail, codeMatches, isReviewer, userIdFor, issueToken } from './lib/common.mjs';

export const config = { path: '/api/auth-verify' };

export default endpoint(async (req) => {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!isReviewer(email, body.code) && !codeMatches(email, body.code)) {
        throw fail(401, 'That code is wrong or has expired');
    }
    const userId = userIdFor(email);
    return json(req, 200, { userId, email, token: issueToken(userId, email) });
});
