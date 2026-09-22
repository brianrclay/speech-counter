const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'billing.js'), 'utf8');
const pkg = { id: 'lifetime', raw: { identifier: '$rc_lifetime' } };
const user = { userId: 'u_verified', email: 'teacher@example.com' };

function device({ session = null, customers = new Set(), legacy = false } = {}) {
    let current = '$RCAnonymousID:device';
    let cached = null;
    const calls = [];
    const controls = { loginError: null, purchaseError: null, beforeLogin: null };
    if (legacy) customers.add(current);
    const info = () => ({
        originalAppUserId: current,
        entitlements: { active: customers.has(current) ? { roster: { productIdentifier: 'lifetime', isActive: true } } : {} },
    });
    const Purchases = {
        async configure(config) { current = config.appUserID || current; },
        addCustomerInfoUpdateListener() { return 'callback-id'; },
        async getCustomerInfo() { return { customerInfo: info() }; },
        async logIn({ appUserID }) {
            calls.push(['login', appUserID]);
            if (controls.beforeLogin) await controls.beforeLogin();
            if (controls.loginError) throw controls.loginError;
            // Model RevenueCat's anonymous-to-new-account alias behavior.
            if (current.startsWith('$RCAnonymousID:') && customers.has(current)) customers.add(appUserID);
            current = appUserID;
            return { customerInfo: info() };
        },
        async purchasePackage() {
            calls.push(['purchase', current]);
            if (controls.purchaseError) throw controls.purchaseError;
            customers.add(current);
            return { customerInfo: info() };
        },
        async restorePurchases() {
            calls.push(['restore', current]);
            customers.add(current);
            return { customerInfo: info() };
        },
        async logOut() { current = '$RCAnonymousID:logged-out'; return { customerInfo: info() }; },
    };
    const store = {
        ready: async () => {},
        session: { get: () => session },
        entitlements: { set: (value) => { cached = value; }, isPremium: () => Boolean(cached?.active) },
    };
    const window = {
        SpeechStore: store,
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Purchases } },
    };
    vm.runInNewContext(source, { window });
    return { billing: window.SpeechBilling, calls, controls, setSession: (value) => { session = value; } };
}

test('signed-out purchase and restore never open an Apple transaction', async () => {
    const d = device();
    await assert.rejects(d.billing.purchase(pkg), /Sign in or create an account/);
    await assert.rejects(d.billing.restore(), /Sign in or create an account/);
    assert.deepEqual(d.calls, []);
});

test('checkout identifies the verified account before opening Apple purchase', async () => {
    const d = device();
    await d.billing.ready();
    d.setSession(user);
    const result = await d.billing.purchase(pkg);
    assert.equal(result.active, true);
    assert.deepEqual(d.calls, [['login', user.userId], ['purchase', user.userId]]);
});

test('failed RevenueCat sign-in blocks checkout; a retry recovers', async () => {
    const d = device({ session: user });
    d.controls.loginError = new Error('Billing offline');
    await assert.rejects(d.billing.logIn(user.userId), /Billing offline/);
    await assert.rejects(d.billing.purchase(pkg), /Billing offline/);
    assert.equal(d.calls.some(([name]) => name === 'purchase'), false);
    d.controls.loginError = null;
    assert.equal((await d.billing.purchase(pkg)).active, true);
});

test('existing Pro on another device is recovered by account without purchasing again', async () => {
    const customers = new Set();
    await device({ session: user, customers }).billing.purchase(pkg);
    const second = device({ session: user, customers });
    assert.equal((await second.billing.refresh()).active, true);
    assert.equal((await second.billing.purchase(pkg)).active, true);
    assert.equal(second.calls.some(([name]) => name === 'purchase' || name === 'restore'), false);
});

test('legacy anonymous purchase can be linked without charging again', async () => {
    const d = device({ legacy: true });
    await d.billing.ready();
    d.setSession(user);
    assert.equal((await d.billing.purchase(pkg)).active, true);
    assert.deepEqual(d.calls, [['login', user.userId]]);
});

test('restore identifies the account first', async () => {
    const d = device({ session: user });
    assert.equal((await d.billing.restore()).active, true);
    assert.deepEqual(d.calls, [['login', user.userId], ['restore', user.userId]]);
});

test('account changes during billing sign-in block checkout', async () => {
    const d = device({ session: user });
    d.controls.beforeLogin = async () => d.setSession({ userId: 'u_other' });
    await assert.rejects(d.billing.purchase(pkg), /account changed/);
    assert.equal(d.calls.some(([name]) => name === 'purchase'), false);
});

test('concurrent checkout requests charge only once', async () => {
    const d = device({ session: user });
    const results = await Promise.all([d.billing.purchase(pkg), d.billing.purchase(pkg)]);
    assert.ok(results.every((result) => result.active));
    assert.equal(d.calls.filter(([name]) => name === 'purchase').length, 1);
});

test('Apple cancellation returns no entitlement and allows a retry', async () => {
    const d = device({ session: user });
    d.controls.purchaseError = { userCancelled: true };
    assert.equal(await d.billing.purchase(pkg), null);
    d.controls.purchaseError = null;
    assert.equal((await d.billing.purchase(pkg)).active, true);
});
