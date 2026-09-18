import { createHmac, createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
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
    // This site's own branch deploys and deploy previews, nothing else on netlify.app.
    return /^https:\/\/(?:[a-z0-9-]+--)?speech-counter\.netlify\.app$/.test(origin);
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
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) },
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

// Sign-in codes are random, single-use, and expire after ten minutes. Only
// an HMAC of the code is stored, under a hash of the email, so the blob
// store holds nothing usable on its own. Requesting a new code replaces the
// old one, and five wrong guesses burn it.
function codeStore() {
    return getStore({ name: 'auth-codes', consistency: 'strong' });
}

function codeKey(email) {
    return createHash('sha256').update(email).digest('hex');
}

function codeDigest(email, code) {
    return b64url(hmac(env('AUTH_SECRET'), `code|${email}|${code}`));
}

export async function issueCode(email) {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    await codeStore().setJSON(codeKey(email), {
        digest: codeDigest(email, code),
        expiresAt: Date.now() + CODE_TTL_MS,
        attempts: 0,
    });
    return code;
}

export async function consumeCode(email, code) {
    const store = codeStore();
    const key = codeKey(email);
    const record = await store.get(key, { type: 'json' });
    if (!record) return false;
    if (record.expiresAt < Date.now()) {
        await store.delete(key);
        return false;
    }
    const given = String(code || '').replace(/\D/g, '');
    if (given.length === 6 && safeEqual(record.digest, codeDigest(email, given))) {
        await store.delete(key);
        return true;
    }
    record.attempts += 1;
    if (record.attempts >= CODE_MAX_ATTEMPTS) {
        await store.delete(key);
        throw fail(429, 'Too many wrong codes. Request a new one');
    }
    await store.setJSON(key, record);
    return false;
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
