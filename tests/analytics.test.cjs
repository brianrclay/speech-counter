const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../analytics.js'), 'utf8');
function device(host = 'speechcount.com', off = false) {
    const saved = new Map(off ? [['speech-counter:analytics', 'off']] : []);
    const scripts = [];
    const listeners = {};
    const window = { addEventListener(name, fn) { listeners[name] = fn; } };
    const document = { referrer: 'https://example.com/?email=secret', createElement: () => ({}),
        head: { appendChild(s) { scripts.push(s); } }, addEventListener() {} };
    const localStorage = { getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v) };
    vm.runInNewContext(source, { window, document, localStorage, location: { hostname: host, protocol: 'https:', origin: 'https://' + host, pathname: '/students.html' }, setTimeout, clearTimeout, AbortSignal, URLSearchParams });
    return { window, scripts, saved, listeners, analytics: window.SpeechAnalytics };
}
test('production tracking uses allowlisted values and excludes free text', () => {
    const d = device();
    d.analytics.track('student_create', { student_name: 'Sensitive name', target: 'Sensitive target', platform: 'web' });
    const event = d.window.dataLayer.at(-1);
    assert.equal(event[1], 'student_create');
    assert.deepEqual(JSON.parse(JSON.stringify(event[2])), { platform: 'web' });
    assert.ok(!JSON.stringify(d.window.dataLayer).includes('secret'));
    const length = d.window.dataLayer.length;
    d.analytics.track('purchase', { value: 99 });
    assert.equal(d.window.dataLayer.length, length);
});
test('staging and native origins never load GA', () => {
    for (const host of ['localhost', 'preview--speech-counter.netlify.app', 'malicious.example']) {
        const d = device(host);
        d.analytics.track('board_count');
        assert.equal(d.scripts.length, 0);
    }
});
test('opt-out works immediately; opt-in does not load a second script', async () => {
    const d = device();
    await d.analytics.setEnabled(false);
    const length = d.window.dataLayer.length;
    d.analytics.track('board_count');
    assert.equal(d.window.dataLayer.length, length);
    assert.equal(d.window['ga-disable-G-QPE28RCTSV'], true);
    await d.analytics.setEnabled(true);
    d.analytics.track('board_count');
    assert.equal(d.window.dataLayer.at(-1)[1], 'board_count');
    assert.equal(d.scripts.length, 1);
});
test('an existing opt-out loads no tag', () => {
    const d = device('speechcount.com', true);
    assert.equal(d.scripts.length, 0);
    assert.equal(d.analytics.enabled(), false);
});
