const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function sheetFixture() {
    const nodes = new Map();
    function node(id) {
        if (!nodes.has(id)) nodes.set(id, {
            hidden: id === 'sheet', value: 'teacher@example.com', style: {}, dataset: {},
            classList: { add() {}, remove() {} }, listeners: {},
            addEventListener(name, callback) { this.listeners[name] = callback; },
            querySelector: node,
            querySelectorAll: () => ['email', 'code'].map((step) => ({ ...node(step), dataset: { step } })),
            replaceChildren() {}, focus() {}, checkValidity: () => true,
        });
        return nodes.get(id);
    }
    let completeVerification;
    const verified = new Promise((resolve) => { completeVerification = resolve; });
    const window = {
        SpeechAccount: { requestCode: async () => {}, verifyCode: () => verified },
        matchMedia: () => ({ matches: true }),
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sheet.js'), 'utf8'), {
        window, document: { getElementById: node, querySelectorAll: () => [], addEventListener() {} },
        setTimeout: (callback) => callback(),
    });
    return {
        sheet: window.SpeechSheet,
        submit: () => node('sheet-form').listeners.submit({ preventDefault() {} }),
        enterEmail: () => { node('sheet-email').value = 'teacher@example.com'; },
        completeVerification,
    };
}

test('verified email continues checkout once', async () => {
    const f = sheetFixture();
    let checkouts = 0;
    f.sheet.open({ onSignedIn: () => { checkouts += 1; } });
    f.enterEmail();
    await f.submit();
    const pending = f.submit();
    f.completeVerification();
    await pending;
    assert.equal(checkouts, 1);
});

test('dismissing verification never starts checkout when sign-in completes later', async () => {
    const f = sheetFixture();
    let checkouts = 0;
    f.sheet.open({ onSignedIn: () => { checkouts += 1; } });
    f.enterEmail();
    await f.submit();
    const pending = f.submit();
    f.sheet.close();
    f.completeVerification();
    await pending;
    assert.equal(checkouts, 0);
});
