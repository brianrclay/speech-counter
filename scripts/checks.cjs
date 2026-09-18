// Security and data-integrity checks for the sync backend and the client
// store, run against the real source with an in-memory blob store, mocked
// billing, and a mocked browser. Each assertion is the safe behaviour for a
// finding from the September 2026 review. Run: node scripts/checks.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ---- in-memory Netlify Blobs with ETags and conditional writes ----
const blobs = new Map();
let etagSeq = 0;
let readGate = null;
function getStore({ name }) {
    const k = (key) => name + '|' + key;
    return {
        async get(key) {
            const e = blobs.get(k(key));
            return e ? clone(e.value) : null;
        },
        async getWithMetadata(key) {
            if (name === 'rosters' && readGate) {
                const g = readGate;
                readGate = null;
                g.started();
                await g.wait;
            }
            const e = blobs.get(k(key));
            return e ? { data: clone(e.value), etag: e.etag } : null;
        },
        async setJSON(key, value, opts = {}) {
            const cur = blobs.get(k(key));
            if (opts.onlyIfNew && cur) return { modified: false };
            if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
            const etag = 'etag-' + (++etagSeq);
            blobs.set(k(key), { value: clone(value), etag });
            return { modified: true, etag };
        },
        async delete(key) {
            blobs.delete(k(key));
        },
    };
}

const testProcess = { env: { AUTH_SECRET: 'test-only-secret', REVIEW_EMAIL: 'reviewer@example.test', REVIEW_CODE: '654321', RC_SECRET_KEY: 'test-only' } };
const premiumFetch = async () => ({ ok: true, json: async () => ({ subscriber: { entitlements: { roster: { expires_date: null } } } }) });

function loadCommon() {
    const src = source('netlify/functions/lib/common.mjs').replace(/^import .*;\n/gm, '').replace(/export /g, '');
    const names = ['endpoint', 'json', 'fail', 'env', 'fetchWithTimeout', 'stores', 'normalizeEmail', 'resolveAccount', 'saveAccount', 'issueCode', 'consumeCode', 'isReviewerEmail', 'reviewerCodeMatches', 'issueToken', 'verifyToken', 'authenticate', 'assertPremium', 'mergeRecords'];
    const factory = new Function('createHmac', 'createHash', 'randomBytes', 'randomInt', 'timingSafeEqual', 'getStore', 'process', 'fetch', src + '\nreturn {' + names.join(',') + '};');
    return factory(crypto.createHmac, crypto.createHash, crypto.randomBytes, crypto.randomInt, crypto.timingSafeEqual, getStore, testProcess, premiumFetch);
}
const common = loadCommon();

function handler(file) {
    const s = source(file).replace(/^import .*;\n/gm, '').replace(/export const config/g, 'const config').replace('export default endpoint', 'return endpoint');
    return new Function(...Object.keys(common), 'getStore', 'fetch', s)(...Object.values(common), getStore, premiumFetch);
}
const req = (body, token) => new Request('https://example.test/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const ctx = { deploy: { context: 'production' } };
const S = common.stores(ctx);

// ---- mocked browser for the client store ----
function client() {
    const mem = new Map();
    const timers = new Map();
    let ti = 0;
    const listeners = {};
    const window = {
        addEventListener: (n, cb) => { (listeners[n] ??= []).push(cb); },
        removeEventListener: () => {},
        dispatchEvent: (e) => { for (const cb of listeners[e.type] || []) cb(e); },
    };
    const sandbox = {
        window,
        localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) },
        navigator: {},
        CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
        setTimeout: (f, ms) => { timers.set(++ti, { f, ms }); return ti; },
        clearTimeout: (id) => timers.delete(id),
        console, crypto,
        location: { hostname: 'example.test', protocol: 'https:' },
        confirm: () => false,
        document: { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' },
        AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
        fetch: async () => ({ ok: true, json: async () => ({}) }),
    };
    vm.createContext(sandbox);
    vm.runInContext(source('store.js'), sandbox);
    return { sandbox, window, mem, timers, runTimers: () => { const t = [...timers.values()]; timers.clear(); t.forEach((x) => x.f()); } };
}
const student = (id, name) => ({ id, name, nameKey: name.toLowerCase(), createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null });

let passed = 0;
function ok(msg) { passed += 1; console.log('PASS', msg); }

(async () => {
    const verify = handler('netlify/functions/auth-verify.mjs');
    const sync = handler('netlify/functions/sync.mjs');
    const del = handler('netlify/functions/account-delete.mjs');

    // 1. reviewer must present the code
    assert.equal((await verify(req({ email: 'reviewer@example.test' }), ctx)).status, 401);
    assert.equal((await verify(req({ email: 'reviewer@example.test', code: '000000' }), ctx)).status, 401);
    assert.equal((await verify(req({ email: 'reviewer@example.test', code: '654321' }), ctx)).status, 200);
    ok('reviewer email without (or with a wrong) code is refused');

    // 8. single-use codes, attempt lockout, cooldown
    const code = await common.issueCode('otp@example.test', S);
    const consumed = await Promise.all([common.consumeCode('otp@example.test', code, S), common.consumeCode('otp@example.test', code, S)]);
    assert.deepEqual(consumed.sort(), [false, true]);
    ok('a code is accepted exactly once under concurrent verification');
    await common.issueCode('cool@example.test', S);
    await assert.rejects(common.issueCode('cool@example.test', S), /just sent/);
    ok('re-requesting a code within the cooldown is refused');
    blobs.clear();
    const code2 = await common.issueCode('lock@example.test', S);
    for (let i = 0; i < 4; i += 1) assert.equal(await common.consumeCode('lock@example.test', '000000', S), false);
    await assert.rejects(common.consumeCode('lock@example.test', '000000', S), /Too many/);
    assert.equal(await common.consumeCode('lock@example.test', code2, S), false);
    ok('five wrong guesses burn the code, including for the right code afterwards');

    // 9. identity is independent of the signing secret
    const { account: acc } = await common.resolveAccount('owner@example.test', S);
    testProcess.env.AUTH_SECRET = 'rotated';
    const again = await common.resolveAccount('owner@example.test', S);
    assert.equal(again.account.userId, acc.userId);
    testProcess.env.AUTH_SECRET = 'test-only-secret';
    ok('rotating AUTH_SECRET keeps the same account id');

    // 4. deletion revokes tokens; re-sign-in starts empty
    const token = common.issueToken(acc.userId, 'owner@example.test');
    assert.equal((await sync(req({ students: [student('s1', 'One')] }, token), ctx)).status, 200);
    assert.equal((await del(req({}, token), ctx)).status, 200);
    assert.equal((await sync(req({ students: [student('s1', 'One')] }, token), ctx)).status, 401);
    assert.equal(blobs.get('rosters|' + acc.userId), undefined);
    await new Promise((r) => setTimeout(r, 2));
    const back = await common.issueCode('owner@example.test', S);
    const relogin = await verify(req({ email: 'owner@example.test', code: back }), ctx);
    assert.equal(relogin.status, 200);
    const fresh = (await relogin.json()).token;
    const empty = await (await sync(req({}, fresh), ctx)).json();
    assert.equal(empty.students.length, 0);
    ok('a deleted account\'s old token is refused and cannot recreate the roster; signing in again starts empty');

    // 6. concurrent syncs keep both inserts
    await Promise.all([sync(req({ students: [student('a', 'A')] }, fresh), ctx), sync(req({ students: [student('b', 'B')] }, fresh), ctx)]);
    assert.equal(blobs.get('rosters|' + acc.userId).value.students.length, 2);
    ok('two concurrent syncs adding different students keep both');

    // 7. a slow writer's record is not skipped by a faster poll
    let release; let started;
    const startedP = new Promise((r) => { started = r; });
    readGate = { started, wait: new Promise((r) => { release = r; }) };
    const slow = sync(req({ students: [student('late', 'Late')] }, fresh), ctx);
    await startedP;
    const poll = await (await sync(req({}, fresh), ctx)).json();
    release();
    await slow;
    const next = await (await sync(req({ since: poll.rev }, fresh), ctx)).json();
    assert.ok(next.students.some((s) => s.id === 'late'));
    ok('a record committed after a poll shows up on the next poll (rev cursor, not timestamp)');

    // 17. tombstones carry no content and are compacted
    const gone = { ...student('a', 'A'), name: 'Secret Name', deletedAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' };
    await sync(req({ students: [gone] }, fresh), ctx);
    const stored = blobs.get('rosters|' + acc.userId).value.students.find((s) => s.id === 'a');
    assert.equal(stored.name, '');
    assert.ok(stored.deletedAt);
    const ancient = { ...student('old', 'Old'), deletedAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' };
    await sync(req({ students: [ancient] }, fresh), ctx);
    assert.ok(!blobs.get('rosters|' + acc.userId).value.students.some((s) => s.id === 'old'));
    ok('deleted records are stored blank and expired tombstones are dropped');

    // 20. paging: 4500 records arrive in pages, nothing lost
    for (let i = 0; i < 3; i += 1) {
        await sync(req({ sessions: Array.from({ length: 1500 }, (_, j) => ({ id: 'q' + (i * 1500 + j), studentId: 'b', target: 't', correct: 1, incorrect: 0, startedAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null })) }, fresh), ctx);
    }
    let cursor = 0; let pulled = 0; let pages = 0; let more = true;
    while (more) {
        const page = await (await sync(req({ since: cursor }, fresh), ctx)).json();
        pulled += page.sessions.length; cursor = page.rev; more = page.more; pages += 1;
        assert.ok(pages < 10);
    }
    assert.equal(pulled, 4500);
    assert.ok(pages >= 3);
    ok('a 4,500-record roster downloads in pages with a stable cursor');
    assert.equal((await sync(req({ students: Array.from({ length: 2001 }, (_, i) => student('x' + i, 'X')) }, fresh), ctx)).status, 413);
    ok('a single request over the per-request limit is rejected (client chunks at 1,000)');

    // ---- client ----
    // 2. account switch does not carry the previous account's roster
    const c = client();
    const st = c.window.SpeechStore;
    await st.ready();
    st.students.findOrCreate('Device Student');
    await st.session.set({ userId: 'account-A', token: 'A' });
    assert.equal(st.students.list().length, 0);
    st.students.findOrCreate('Student from A');
    st.board.save([{ name: 'Board Student', target: 'Sensitive', correct: 1, incorrect: 0 }]);
    await st.flush();
    c.window.SpeechBilling = { platform: () => 'web', logIn: async () => {}, logOut: async () => {}, track: () => {} };
    c.sandbox.fetch = async () => ({ ok: true, json: async () => ({ userId: 'account-B', email: 'b@example.test', token: 'B' }) });
    vm.runInContext(source('account.js'), c.sandbox);
    await c.window.SpeechAccount.signOut();
    assert.equal(st.students.list()[0].name, 'Device Student');
    await c.window.SpeechAccount.verifyCode('b@example.test', '123456');
    assert.equal(st.session.get().userId, 'account-B');
    assert.equal(st.students.list().length, 0);
    assert.equal(st.pendingChanges().students.length, 0);
    ok('account B sees neither the device roster nor account A\'s roster (import declined)');
    c.sandbox.confirm = () => true;
    await c.window.SpeechAccount.signOut();
    await c.window.SpeechAccount.verifyCode('b@example.test', '123456');
    assert.equal(JSON.stringify(st.students.list().map((s) => s.name)), '["Device Student"]');
    assert.equal(st.pendingChanges().students.length, 1);
    await st.session.clear();
    assert.equal(st.students.list().length, 0);
    ok('accepting the import moves the device roster into the account and clears the device copy');

    // 5. remove-from-device erases the board and storage keys
    await st.session.set({ userId: 'account-A', token: 'A' });
    assert.equal(st.board.load()[0].name, 'Board Student');
    await c.window.SpeechAccount.signOut({ removeLocal: true });
    await st.session.set({ userId: 'account-A', token: 'A' });
    assert.equal(st.students.list().length, 0);
    assert.equal(st.board.load(), null);
    assert.ok(![...c.mem.keys()].some((k) => k.endsWith(':account-A')));
    ok('removing the account from the device erases students, sessions, board, and sync keys');

    // 10. CSV formula neutralised
    await st.session.clear();
    st.students.findOrCreate('=1+1');
    assert.ok(st.exportCSV().includes("\r\n'=1+1,"));
    assert.ok(!st.exportCSV().includes('\r\n=1+1,'));
    ok('CSV export neutralises formula-leading cells');

    // 17 (client). deleting a student blanks it locally
    const victim = st.students.findOrCreate('Victim');
    st.students.remove(victim.id);
    const raw = JSON.parse(JSON.stringify(st.pendingChanges().students.find((s) => s.id === victim.id)));
    assert.equal(raw.name, '');
    assert.ok(raw.deletedAt);
    ok('a deleted student is kept only as a blank tombstone');

    // 3. a sync response arriving after stop() is dropped
    const t = client();
    const ts = t.window.SpeechStore;
    await ts.ready();
    await ts.session.set({ userId: 'A', token: 'A' });
    ts.entitlements.set({ active: true });
    let resolveCall;
    t.window.SpeechAccount = { call: () => new Promise((r) => { resolveCall = r; }), apiBase: () => '', signOut: () => {} };
    t.window.SpeechBilling = { refresh: async () => {} };
    vm.runInContext(source('sync.js'), t.sandbox);
    await Promise.resolve(); await Promise.resolve();
    const kick = [...t.timers.values()].find((x) => x.ms === 0);
    assert.ok(kick, 'sync scheduled');
    const running = kick.f();
    await Promise.resolve();
    t.window.SpeechSync.stop();
    await ts.clearWorkspace();
    await ts.session.clear();
    resolveCall({ rev: 1, more: false, students: [student('restored', 'Old Account Student')], sessions: [] });
    await running;
    assert.equal(ts.students.list().length, 0);
    ok('an in-flight sync response after stop() is discarded');

    // 20 (client). pending uploads go out in chunks
    const u = client();
    const us = u.window.SpeechStore;
    await us.ready();
    await us.session.set({ userId: 'U', token: 'U' });
    us.entitlements.set({ active: true });
    for (let i = 0; i < 2500; i += 1) us.students.findOrCreate('S' + i);
    const calls = [];
    u.window.SpeechAccount = { call: async (p, body) => { calls.push(body.students.length); return { rev: calls.length, more: false, students: [], sessions: [] }; }, apiBase: () => '', signOut: () => {} };
    u.window.SpeechBilling = { refresh: async () => {} };
    vm.runInContext(source('sync.js'), u.sandbox);
    await Promise.resolve(); await Promise.resolve();
    await [...u.timers.values()].find((x) => x.ms === 0).f();
    assert.deepEqual(calls, [1000, 1000, 500]);
    assert.equal(us.hasPending(), false);
    ok('2,500 pending records upload in chunks of 1,000 and are cleared once acknowledged');

    // 11. dev server
    let serve; let readPath = null; let listenArgs; const responses = [];
    const mockRequire = (k) => (k === 'http' ? { createServer: (f) => { serve = f; return { listen: (...a) => { listenArgs = a; } }; } } : k === 'fs' ? { readFile: (p, cb) => { readPath = p; cb(new Error('mock')); } } : require(k));
    vm.runInNewContext(source('scripts/dev-server.js'), { require: mockRequire, __dirname: path.join(root, 'scripts'), console });
    const res = () => ({ writeHead: (code) => responses.push(code), end: () => {} });
    serve({ url: '/%2e%2e/package.json' }, res());
    assert.equal(readPath, null);
    serve({ url: '/%ZZ' }, res());
    assert.deepEqual(responses, [404, 400]);
    assert.equal(listenArgs[1], '127.0.0.1');
    ok('dev server refuses traversal and malformed URLs and binds to loopback');

    // 22. performance
    const perf = client();
    await perf.window.SpeechStore.ready();
    const students = Array.from({ length: 500 }, (_, i) => student('p' + i, 'Student ' + i));
    const sessions = Array.from({ length: 19500 }, (_, i) => ({ id: 'q' + i, studentId: 'p' + (i % 500), correct: 1, incorrect: 1, startedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }));
    let start = performance.now();
    perf.window.SpeechStore.applyRemote({ students, sessions });
    const mergeMs = performance.now() - start;
    start = performance.now();
    perf.window.SpeechStore.sessions.summaryMap();
    const summaryMs = performance.now() - start;
    console.log(`BENCH merge 20,000 records: ${mergeMs.toFixed(1)} ms | summaries for 500 students: ${summaryMs.toFixed(1)} ms`);
    assert.ok(mergeMs < 200 && summaryMs < 50);
    ok('indexed merge and single-pass summaries stay fast');

    console.log(`\n${passed} checks passed`);
})().catch((e) => { console.error('FAIL', e); process.exitCode = 1; });
