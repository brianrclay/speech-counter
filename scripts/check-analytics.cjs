const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PostHog } = require('posthog-js/lib/src/posthog-core');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'analytics.js'), 'utf8');
function fixture({ native = false, optedOut = false, host = 'speechcount.com', internal = false, loading = false, delayedStorage = false } = {}) {
    const scripts = [], sent = [], listeners = {}, data = new Map();
    if (optedOut) data.set('speech-counter:analytics', 'off');
    let session = null, config, sdk, releaseStorage;
    const policyRequests=[];
    const storageReady = delayedStorage ? new Promise(resolve => { releaseStorage=resolve; }) : Promise.resolve();
    const window = {
        addEventListener: (name, fn) => { listeners[name] = fn; },
        SpeechStore: { session: { get: () => session }, ready: () => storageReady },
        Capacitor: { isNativePlatform: () => native, getPlatform: () => 'ios' },
        posthog: { init(key, options) {
            config = options;
            // Exercise the pinned SDK's actual before_send ingestion checks.
            // A capture stub alone missed that stripping the public token drops events.
            sdk = { capture(name, properties) { const event = PostHog.prototype._runBeforeSend.call({ config: options }, { event: name, $set: { email: 'secret' }, $set_once: { $initial_current_url: 'https://private.test/?email=secret' }, properties: { ...properties, token: key, distinct_id: 'anonymous', $current_url: 'https://private.test/?email=secret', $referrer: 'https://private.test/token', $set: { email: 'secret' }, arbitrary: 'private' } }); if (event) sent.push(event); },
                identify: (id) => sent.push({ event: '$identify', id }), reset: () => sent.push({ event: 'reset' }), opt_in_capturing() {}, opt_out_capturing() {} };
            options.loaded(sdk); return sdk;
        } },
    };
    vm.runInNewContext(source, { window, location: { protocol: native ? 'capacitor:' : 'https:', hostname: native ? 'localhost' : host, pathname: '/students.html', origin: native ? 'capacitor://localhost' : 'https://' + host, search: '?email=secret', hash: '#student-id' }, document: { readyState: loading ? 'loading' : 'complete', referrer: 'https://private.test/?secret', createElement: () => ({}), head: { appendChild: (s) => scripts.push(s) }, addEventListener: (name, fn) => { listeners[name] = fn; } }, localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }, URLSearchParams, Promise, AbortSignal, fetch: async (url, request) => { policyRequests.push(JSON.parse(request.body)); return { ok: true, json: async () => ({ enabled: !internal }) }; } });
    return { window, scripts, sent, listeners, data, policyRequests, hydrate: id => {session={userId:id};releaseStorage();}, get config() { return config; }, load: () => scripts.find(s => s.src.startsWith('vendor/'))?.onload(), setSession: id => { session = id ? { userId: id, email: 'private@example.test', token: 'private' } : null; listeners['speech:session'](); } };
}
(async () => {
const ready = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
for (const native of [false, true]) {
    const f = fixture({ native }); await ready();
    f.window.SpeechAnalytics.track('checkout_complete', { item_id: 'monthly', experiment_id: 'web_default_plan_v1', variant_id: 'lifetime', email: 'secret', student: 'secret', value: 2.99, platform: 'android' });
    f.load();
    const event = f.sent.at(-1);
    assert.ok(event, 'The real SDK must accept the sanitized event for ingestion');
    assert.equal(event.event, 'checkout_complete');
    assert.equal(event.properties.platform, native ? 'ios' : 'web');
    assert.equal(event.properties.variant_id, 'lifetime');
    assert.equal(event.properties.$current_url, 'https://speechcount.com/students.html');
    assert.equal(event.properties.token, 'phc_tVXpVbkKuccmtituA9YtNXfchPF2LPf86qSSJ5qt3Cpf');
    assert.equal(event.$set, undefined);
    assert.equal(event.$set_once, undefined);
    for (const key of ['email', 'student', 'value', '$referrer', '$set', 'arbitrary']) assert.equal(event.properties[key], undefined);
    for (const key of ['autocapture', 'capture_pageview', 'capture_pageleave', 'capture_exceptions', 'capture_performance', 'ip']) assert.equal(f.config[key], false);
    assert.equal(f.config.disable_session_recording, true);
    assert.equal(f.config.before_send({ event: '$autocapture', properties: {} }), null);
    assert.equal(Boolean(f.window.gtag), !native);
    const a = 'u_' + 'a'.repeat(32), b = 'u_' + 'b'.repeat(32);
    f.setSession(a); await ready(); f.setSession(b); await ready(); f.setSession(null); await ready();
    assert.deepEqual(f.sent.slice(-4).map(x => x.event), ['$identify', 'reset', '$identify', 'reset']);
    assert.equal(f.sent.filter(x => x.event === '$identify').at(-1).id, b);
    f.window.SpeechAnalytics.setEnabled(false);
    const count = f.sent.length;
    f.window.SpeechAnalytics.track('checkout_complete');
    assert.equal(f.sent.length, count);
    assert.equal(f.config.before_send({ event: 'checkout_complete', properties: {} }), null);
}
for (const options of [{ optedOut: true }, { host: 'preview.netlify.app' }, { host: 'localhost' }, { internal: true }]) {
    const f = fixture(options); await ready(); assert.equal(f.scripts.length, 0); f.window.SpeechAnalytics.track('board_count'); assert.equal(f.sent.length, 0);
}
const boot = fixture({native:true,loading:true,delayedStorage:true});
boot.listeners.DOMContentLoaded(); await ready(); assert.equal(boot.policyRequests.length,0);
const owner='u_'+'c'.repeat(32); boot.hydrate(owner); await ready();
assert.equal(boot.policyRequests[0].userId,owner);
const late = fixture(); await ready(); late.window.SpeechAnalytics.track('begin_checkout'); late.window.SpeechAnalytics.setEnabled(false); late.load(); assert.equal(late.sent.length, 0);
console.log('PASS web/iOS delivery, strict property filtering, identity changes, opt-out including queued events, and preview exclusion');

})().catch(err => { console.error(err); process.exitCode=1; });
