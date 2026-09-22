const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'billing.js'), 'utf8');
const key = 'speech-counter:experiment:web_default_plan_v1';

function browser({ data = new Map(), random = 0.75, native = false, blocked = false } = {}) {
    const events = [];
    const window = {
        SpeechStore: {},
        Capacitor: { isNativePlatform: () => native, getPlatform: () => 'ios' },
        SpeechAnalytics: { track(name, params) {
            if (data.get('speech-counter:analytics') !== 'off') events.push(['event', name, params]);
        } },
    };
    vm.runInNewContext(source, {
        window,
        Math: { random: () => random },
        localStorage: {
            getItem(k) { if (blocked) throw Error('Blocked'); return data.get(k) ?? null; },
            setItem(k, v) { if (blocked) throw Error('Blocked'); data.set(k, v); },
        },
    });
    return { billing: window.SpeechBilling, events, data };
}

for (const [random, expected] of [[0.25, 'lifetime'], [0.75, 'monthly']]) {
    const b = browser({ random });
    assert.equal(b.data.size, 0, 'No enrollment before paywall');
    assert.equal(b.billing.defaultPlan(), expected);
    assert.equal(browser({ data: b.data, random: 1 - random }).billing.defaultPlan(), expected, 'Stable across reloads');
    for (const event of ['paywall_view', 'paywall_cta_click', 'begin_checkout', 'purchase']) {
        b.billing.track(event, { item_id: 'lifetime' });
        const sent = b.events.at(-1);
        assert.equal(sent[1], event);
        assert.equal(sent[2].variant_id, expected, 'Selected plan does not change assignment');
        assert.equal(sent[2].item_id, 'lifetime');
    }
    b.data.set('speech-counter:analytics', 'off');
    b.billing.track('paywall_cta_click');
    assert.equal(b.events.length, 4, 'Opt-out suppresses subsequent events');
}
for (const options of [{ native: true }, { blocked: true }, { data: new Map([['speech-counter:analytics', 'off']]) }]) {
    const b = browser(options);
    assert.equal(b.billing.defaultPlan(), 'lifetime');
    assert.equal(b.data.has(key), false);
    b.billing.track('paywall_view');
    assert.equal(b.events[0]?.[2].variant_id, undefined);
}
const invalid = browser({ data: new Map([[key, 'invalid']]) });
assert.equal(invalid.billing.defaultPlan(), 'monthly');
console.log('Plan experiment checks passed');
