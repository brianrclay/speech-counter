import { endpoint, json, fail, env, normalizeEmail, issueCode, isReviewerEmail, stores, fetchWithTimeout } from './lib/common.mjs';

// Each request sends an email, so keep one client from turning this into a
// spam cannon or running up the Resend bill. A per-recipient cooldown lives
// in issueCode.
export const config = {
    path: '/api/auth-code',
    rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' },
};

async function sendEmail(email, code) {
    let response;
    try {
        response = await fetchWithTimeout('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env('RESEND_API_KEY')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: env('MAIL_FROM', 'Speech Count <hello@speechcount.com>'),
                to: [email],
                subject: `${code} is your Speech Count code`,
                text: `Your Speech Count sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
            }),
        });
    } catch (err) {
        throw fail(502, 'Could not send the email right now. Try again in a minute');
    }
    if (!response.ok) {
        console.error('Resend error', response.status);
        throw fail(502, 'Could not send the email right now. Try again in a minute');
    }
}

export default endpoint(async (req, context) => {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!isReviewerEmail(email)) await sendEmail(email, await issueCode(email, stores(context)));
    return json(req, 200, { ok: true });
});
