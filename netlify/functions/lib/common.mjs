import { createHmac, createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_COOLDOWN_MS = 30 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PREMIUM_CACHE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const WRITE_RETRIES = 5;

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
            if (status === 500) console.error(err && err.message ? err.message : err);
            return json(req, status, { error: status === 500 ? 'Something went wrong' : err.message });
        }
    };
}

export function fail(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Outbound calls to providers get a hard deadline so a slow upstream can't
// pin a function invocation (and the client's in-flight slot) open.
export function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
    return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

// Production and every other deploy context keep separate data. Blob store
// names are site-wide, so a preview would otherwise read and write the real
// rosters.
export function stores(context) {
    const deployContext = (context && context.deploy && context.deploy.context) || 'production';
    const suffix = deployContext === 'production' ? '' : '-staging';
    const open = (name) => getStore({ name: name + suffix, consistency: 'strong' });
    return {
        rosters: open('rosters'),
        accounts: open('accounts'),
        codes: open('auth-codes'),
    };
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

function emailKey(email) {
    return 'email:' + createHash('sha256').update(email).digest('hex');
}

// Accounts get a random id on first sign-in, recorded against a hash of the
// email, so rotating AUTH_SECRET never changes who owns a roster. The account
// record also carries the session-revocation stamp and a short-lived copy of
// the entitlement check.
export async function resolveAccount(email, { accounts }) {
    for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
        const index = await accounts.get(emailKey(email), { type: 'json' });
        if (index && index.userId) return loadAccount(index.userId, email, accounts);
        const userId = 'u_' + randomBytes(16).toString('hex');
        const { modified } = await accounts.setJSON(emailKey(email), { userId }, { onlyIfNew: true });
        if (modified) return loadAccount(userId, email, accounts);
    }
    throw fail(503, 'Could not sign you in right now. Try again');
}

async function loadAccount(userId, email, accounts) {
    const existing = await accounts.getWithMetadata(userId, { type: 'json' });
    if (existing && existing.data) return { account: existing.data, etag: existing.etag };
    const account = { userId, email, createdAt: new Date().toISOString(), tokensValidAfter: 0, premium: null };
    const { etag } = await accounts.setJSON(userId, account);
    return { account, etag };
}

export async function saveAccount(account, { accounts }, etag) {
    const options = etag ? { onlyIfMatch: etag } : {};
    const result = await accounts.setJSON(account.userId, account, options);
    return result.modified ? result.etag : null;
}

// Sign-in codes are random, single-use, and expire after ten minutes. Only
// an HMAC of the code is stored, under a hash of the email. Every state
// change is a conditional write on the record's ETag, so two requests can't
// both consume one code or lose each other's attempt count.
function codeDigest(email, code) {
    return b64url(hmac(env('AUTH_SECRET'), `code|${email}|${code}`));
}

export async function issueCode(email, { codes }) {
    const key = emailKey(email);
    const existing = await codes.get(key, { type: 'json' });
    if (existing && existing.issuedAt && Date.now() - existing.issuedAt < CODE_COOLDOWN_MS) {
        throw fail(429, 'A code was just sent. Check your email, or try again in a minute');
    }
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    await codes.setJSON(key, {
        digest: codeDigest(email, code),
        issuedAt: Date.now(),
        expiresAt: Date.now() + CODE_TTL_MS,
        attempts: 0,
    });
    return code;
}

export async function consumeCode(email, code, { codes }) {
    const key = emailKey(email);
    const given = String(code || '').replace(/\D/g, '');
    for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
        const found = await codes.getWithMetadata(key, { type: 'json' });
        const record = found && found.data;
        if (!record || record.consumed) return false;
        if (record.expiresAt < Date.now()) {
            await codes.delete(key);
            return false;
        }
        if (given.length === 6 && safeEqual(record.digest, codeDigest(email, given))) {
            const { modified } = await codes.setJSON(key, { consumed: true, expiresAt: record.expiresAt }, { onlyIfMatch: found.etag });
            if (!modified) return false;
            await codes.delete(key);
            return true;
        }
        const next = { ...record, attempts: record.attempts + 1 };
        if (next.attempts >= CODE_MAX_ATTEMPTS) {
            const { modified } = await codes.setJSON(key, { consumed: true, expiresAt: record.expiresAt }, { onlyIfMatch: found.etag });
            if (modified) {
                await codes.delete(key);
                throw fail(429, 'Too many wrong codes. Request a new one');
            }
            continue;
        }
        const { modified } = await codes.setJSON(key, next, { onlyIfMatch: found.etag });
        if (modified) return false;
    }
    return false;
}

// The App Review account skips email delivery, but still has to present the
// review code: an omitted code is never a match.
export function isReviewerEmail(email) {
    const reviewEmail = process.env.REVIEW_EMAIL;
    return Boolean(reviewEmail) && email === reviewEmail.toLowerCase();
}

export function reviewerCodeMatches(email, code) {
    const given = String(code || '');
    return isReviewerEmail(email) && given.length > 0 && safeEqual(given, env('REVIEW_CODE'));
}

export function issueToken(userId, email) {
    const now = Date.now();
    const payload = b64url(JSON.stringify({ u: userId, m: email, i: now, e: now + TOKEN_TTL_MS }));
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
    return { userId: claims.u, email: claims.m, issuedAt: claims.i || 0 };
}

// A signed token is necessary but not sufficient: the account must still
// exist and must not have revoked sessions since the token was issued.
export async function authenticate(req, s) {
    const claims = verifyToken(req);
    const found = await s.accounts.getWithMetadata(claims.userId, { type: 'json' });
    const account = found && found.data;
    if (!account || account.deletedAt || claims.issuedAt < (account.tokensValidAfter || 0)) {
        throw fail(401, 'Sign in to continue');
    }
    return { userId: claims.userId, email: claims.email, account, etag: found.etag };
}

// Storage is only for paying users. The answer is cached on the account for
// ten minutes so every sync doesn't turn into a billing API call; a missing
// key fails closed.
const ENTITLEMENT = 'roster';

export async function assertPremium(auth, s) {
    const cached = auth.account.premium;
    if (cached && Date.now() - cached.checkedAt < PREMIUM_CACHE_MS) {
        if (!cached.active) throw fail(402, 'Sync needs an active Speech Count Pro purchase');
        return;
    }
    const key = env('RC_SECRET_KEY');
    let response;
    try {
        response = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(auth.userId)}`, {
            headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        });
    } catch (err) {
        throw fail(502, 'Could not check your subscription right now');
    }
    if (!response.ok) {
        console.error('RevenueCat error', response.status);
        throw fail(502, 'Could not check your subscription right now');
    }
    const data = await response.json();
    const entitlement = data.subscriber && data.subscriber.entitlements && data.subscriber.entitlements[ENTITLEMENT];
    const active = Boolean(entitlement && (!entitlement.expires_date || new Date(entitlement.expires_date) > new Date()));
    auth.account.premium = { active, checkedAt: Date.now() };
    auth.etag = (await saveAccount(auth.account, s, auth.etag)) || auth.etag;
    if (!active) throw fail(402, 'Sync needs an active Speech Count Pro purchase');
}

// Mirrors mergeRecords in store.js: keep whichever copy of a record was
// updated most recently. Keep the two in step.
export function mergeRecords(into, incoming) {
    const index = new Map(into.map((r, i) => [r.id, i]));
    let changed = 0;
    incoming.forEach((record) => {
        if (!record || typeof record.id !== 'string') return;
        const at = index.get(record.id);
        if (at === undefined) {
            index.set(record.id, into.length);
            into.push(record);
            changed += 1;
        } else if ((record.updatedAt || '') > (into[at].updatedAt || '')) {
            into[at] = record;
            changed += 1;
        }
    });
    return changed;
}
