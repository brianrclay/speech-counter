import { endpoint, json, fail, env, normalizeEmail, issueCode, isReviewer } from './lib/common.mjs';

// Each request sends an email, so keep one client from turning this into a
// spam cannon or running up the Resend bill.
export const config = {
    path: '/api/auth-code',
    rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip'], action: 'rate_limit' },
};

async function sendEmail(email, code) {
    const response = await fetch('https://api.resend.com/emails', {
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
    if (!response.ok) {
        console.error('Resend error', response.status, await response.text());
        throw fail(502, 'Could not send the email right now. Try again in a minute');
    }
}

export default endpoint(async (req) => {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!isReviewer(email)) await sendEmail(email, await issueCode(email));
    return json(req, 200, { ok: true });
});
