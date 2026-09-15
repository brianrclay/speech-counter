import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const CODE_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const ALLOWED_ORIGINS = [
    'https://speechcount.com',
    'https://www.speechcount.com',
    'capacitor://localhost',
    'http://localhost',
    'ionic://localhost',
];

export function env(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === '') {
        if (fallback !== undefined) return fallback;
        throw new Error(`Missing environment variable ${name}`);
    }
    return value;
}

function originAllowed(origin) {
    if (!origin) return false;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
    return /^https:\/\/[a-z0-9-]+(--speech-counter)?\.netlify\.app$/.test(origin);
}

export function corsHeaders(req) {
    const origin = req.headers.get('origin');
    if (!originAllowed(origin)) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

export function json(req, status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
}

// Wraps a POST handler with CORS preflight, method checks, and error shaping.
export function endpoint(handler) {
    return async (req, context) => {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
        if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });
        try {
            return await handler(req, context);
        } catch (err) {
            const status = err.status || 500;
            if (status === 500) console.error(err);
            return json(req, status, { error: status === 500 ? 'Something went wrong' : err.message });
        }
    };
}

export function fail(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

export function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw fail(400, 'Enter a valid email address');
    return email;
}

function hmac(key, data) {
    return createHmac('sha256', key).update(data).digest();
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function safeEqual(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

export function userIdFor(email) {
    return 'u_' + createHash('sha256').update(env('AUTH_SECRET') + '|' + email).digest('hex').slice(0, 32);
}

function codeFor(email, window) {
    const digest = hmac(env('AUTH_SECRET'), `code|${email}|${window}`);
    return String(digest.readUInt32BE(0) % 1000000).padStart(6, '0');
}

export function currentCode(email) {
    return codeFor(email, Math.floor(Date.now() / CODE_WINDOW_MS));
}

// Accepts the current and previous window so a code sent right before the
// boundary still works.
export function codeMatches(email, code) {
    const window = Math.floor(Date.now() / CODE_WINDOW_MS);
    const given = String(code || '').replace(/\D/g, '');
    return [window, window - 1].some((w) => safeEqual(codeFor(email, w), given));
}

export function isReviewer(email, code) {
    const reviewEmail = process.env.REVIEW_EMAIL;
    return Boolean(reviewEmail) && email === reviewEmail.toLowerCase()
        && (code === undefined || safeEqual(String(code), env('REVIEW_CODE')));
}

export function issueToken(userId, email) {
    const payload = b64url(JSON.stringify({ u: userId, m: email, e: Date.now() + TOKEN_TTL_MS }));
    return payload + '.' + b64url(hmac(env('AUTH_SECRET'), `token|${payload}`));
}

export function verifyToken(req) {
    const header = req.headers.get('authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '');
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw fail(401, 'Sign in to continue');
    const [payload, signature] = parts;
    const expected = b64url(hmac(env('AUTH_SECRET'), `token|${payload}`));
    if (!safeEqual(expected, signature)) throw fail(401, 'Sign in to continue');
    let claims;
    try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch (err) {
        throw fail(401, 'Sign in to continue');
    }
    if (!claims.u || !claims.e || claims.e < Date.now()) throw fail(401, 'Your sign-in expired. Sign in again');
    return { userId: claims.u, email: claims.m };
}

// Mirrors mergeRecords in store.js: keep whichever copy of a record was
// updated most recently. Keep the two in step.
export function mergeRecords(into, incoming) {
    let changed = 0;
    incoming.forEach((record) => {
        if (!record || typeof record.id !== 'string') return;
        const index = into.findIndex((r) => r.id === record.id);
        if (index === -1) {
            into.push(record);
            changed += 1;
        } else if ((record.updatedAt || '') > (into[index].updatedAt || '')) {
            into[index] = record;
            changed += 1;
        }
    });
    return changed;
}
