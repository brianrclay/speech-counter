const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(agree = false) {
    const data = new Map(), calls = [], events = [];
    let prompts = 0;
    const session = { token: 'test-token', userId: 'test-account' };
    const window = {
        SpeechStore: { session: { get: () => session } },
        SpeechAccount: { call: async (url, body) => { calls.push({ url, body }); return { ok: true }; } },
        SpeechBilling: { experimentContext: () => ({ experimentId: 'web_default_plan_v1', variantId: 'monthly' }) },
        confirm: () => { prompts++; return agree; },
        addEventListener() {},
    };
    const document = {
        referrer: '', addEventListener() {}, createElement: () => ({}),
        head: { appendChild() {
            window.gtag = (command, id, field, callback) => {
                if (command === 'get') callback(field === 'client_id' ? '123.456' : '1790120000');
                else events.push([command, id, field]);
            };
        } },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'analytics.js'), 'utf8'), {
        window, document, location: { protocol: 'https:', hostname: 'speechcount.com', origin: 'https://speechcount.com', pathname: '/students.html' },
        localStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) },
        URLSearchParams, AbortSignal, setTimeout, clearTimeout,
    });
    return { api: window.SpeechAnalytics, calls, events, data, prompts: () => prompts };
}
test('no revenue identifiers before consent; declining still allows checkout preparation', async () => {
    const b = setup(false);
    await b.api.syncContext();
    assert.equal(b.calls.at(-1).body.enabled, false);
    assert.equal(b.calls.at(-1).body.clientId, undefined);
    await b.api.preparePurchase();
    await b.api.preparePurchase();
    assert.equal(b.prompts(), 1);
    assert.equal(b.api.purchaseEnabled(), false);
    assert.ok(b.calls.every(c => !c.body.enabled));
});
test('opt-in links only GA identifiers and experiment; opting out removes them', async () => {
    const b = setup(true);
    await b.api.preparePurchase();
    const body = b.calls.at(-1).body;
    assert.equal(body.enabled, true);
    assert.equal(body.consentVersion, 'purchase-v1');
    assert.equal(body.clientId, '123.456');
    assert.equal(body.variantId, 'monthly');
    assert.ok(!JSON.stringify(body).includes('test-account'));
    await b.api.setPurchaseEnabled(false);
    assert.equal(b.calls.at(-1).body.enabled, false);
    assert.equal(b.calls.at(-1).body.clientId, undefined);
});
test('usage opt-out immediately stops events and disables revenue reporting', async () => {
    const b = setup(true);
    await b.api.preparePurchase();
    await b.api.setEnabled(false);
    const n = b.events.length;
    b.api.track('paywall_cta_click', { item_id: 'monthly' });
    assert.equal(b.events.length, n);
    assert.equal(b.calls.at(-1).body.enabled, false);
});
test('A/B labels survive allowlisting and arbitrary fields do not', () => {
    const b = setup();
    b.api.track('paywall_cta_click', { experiment_id: 'web_default_plan_v1', variant_id: 'monthly', email: 'private@example.com' });
    assert.equal(b.events.at(-1)[2].variant_id, 'monthly');
    assert.equal(b.events.at(-1)[2].email, undefined);
});
