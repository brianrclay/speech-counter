// Exercise billing failures and identity ordering without contacting a store.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'billing.js'), 'utf8');
const inactive = () => ({ entitlements: { active: {} } });
const active = () => ({ entitlements: { active: { roster: { productIdentifier: 'pro_monthly', isActive: true } } } });
const offering = () => ({ current: { availablePackages: [{ identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'pro_monthly', priceString: '$2.99' } }] } });

function fixture() {
    const events = [];
    const calls = [];
    let session = { userId: 'test-account' };
    let info = inactive();
    let configureFailures = 0;
    let offeringsFailures = 0;
    let purchaseError = null;
    let offeringResult = offering();
    let configureCalls = 0;
    let offersCalls = 0;
    let purchaseCalls = 0;
    const plugin = {
        async configure() { configureCalls++; if (configureFailures-- > 0) throw Error('temporary failure'); },
        // Capacitor can return a callback ID synchronously.
        addCustomerInfoUpdateListener() { return 'listener-id'; },
        async getCustomerInfo() { return { customerInfo: info }; },
        async getOfferings() { offersCalls++; if (offeringsFailures-- > 0) throw Error('offline'); return offeringResult; },
        async logIn({ appUserID }) { calls.push('identity:' + appUserID); return { customerInfo: info }; },
        async purchasePackage() { purchaseCalls++; calls.push('payment'); if (purchaseError) throw purchaseError; info = active(); return { customerInfo: info }; },
        async restorePurchases() { return { customerInfo: info }; },
        async logOut() { return { customerInfo: inactive() }; },
    };
    const window = {
        SpeechStore: { ready: async () => {}, session: { get: () => session }, entitlements: { set: () => {} } },
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Purchases: plugin } },
        SpeechAnalytics: { track: (name, params) => events.push({ name, params }) },
    };
    vm.runInNewContext(source, { window });
    return {
        billing: window.SpeechBilling, events, calls, plugin,
        failConfigure: () => { configureFailures = 1; },
        failOffers: () => { offeringsFailures = 1; },
        purchaseError: err => { purchaseError = err; },
        existingPurchase: () => { info = active(); },
        missingPlans: () => { offeringResult = { current: { availablePackages: [] } }; },
        signedOut: () => { session = null; },
        stats: () => ({ configureCalls, offersCalls, purchaseCalls }),
    };
}

(async () => {
    const init = fixture();
    init.failConfigure();
    await assert.rejects(init.billing.ready(), /temporary failure/);
    await init.billing.ready();
    assert.equal(init.stats().configureCalls, 2);
    console.log('PASS failed initialization retries; synchronous listener IDs do not break billing');

    const offers = fixture();
    offers.failOffers();
    await assert.rejects(offers.billing.offerings(), /offline/);
    const [first, second] = await Promise.all([offers.billing.offerings(), offers.billing.offerings()]);
    assert.equal(first[0].id, 'monthly');
    assert.equal(first, second);
    assert.equal(offers.stats().offersCalls, 2);
    offers.missingPlans();
    await assert.rejects(offers.billing.offerings(), /Plans could not load/);
    console.log('PASS plan fetching recovers, shares concurrent requests, and rejects an empty offering');

    const paid = fixture();
    const pkg = (await paid.billing.offerings())[0];
    await paid.billing.purchase(pkg, { source: 'board' });
    assert.deepEqual(paid.calls, ['identity:test-account', 'payment']);
    assert.deepEqual(paid.events.map(e => e.name), ['begin_checkout', 'checkout_complete']);
    assert.equal(paid.events[1].params.source, 'board');
    await paid.billing.purchase(pkg);
    assert.equal(paid.stats().purchaseCalls, 1);
    assert.equal(paid.events.filter(e => e.name === 'checkout_complete').length, 1);
    console.log('PASS checkout identifies the account and records success once; existing access prevents another charge');

    const cancel = fixture();
    cancel.purchaseError({ userCancelled: true, code: 1 });
    assert.equal(await cancel.billing.purchase(pkg), null);
    assert.equal(cancel.events.at(-1).name, 'checkout_cancel');
    const failed = fixture();
    failed.purchaseError(Error('private provider details'));
    await assert.rejects(failed.billing.purchase(pkg), /private provider details/);
    assert.equal(failed.events.at(-1).name, 'checkout_error');
    assert.equal(failed.events.at(-1).params.stage, 'payment');
    assert.equal(JSON.stringify(failed.events).includes('private provider details'), false);
    console.log('PASS cancellations and payment errors are distinct; raw provider errors stay out of analytics');

    const auth = fixture();
    auth.signedOut();
    await assert.rejects(auth.billing.purchase(pkg), /Sign in/);
    assert.equal(auth.stats().purchaseCalls, 0);
    assert.equal(auth.events.at(-1).params.stage, 'identity');
    assert.equal(auth.events.some(e => e.name === 'begin_checkout'), false);
    console.log('PASS missing identity blocks payment and is recorded before checkout begins');

    const analyticsWindow = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'analytics.js'), 'utf8'), {
        window: Object.assign(analyticsWindow, { addEventListener() {} }),
        location: { protocol: 'https:', hostname: 'speechcount.com', origin: 'https://speechcount.com', pathname: '/students.html', search: '' },
        document: { referrer: '', createElement: () => ({}), head: { appendChild() {} } },
        localStorage: { getItem: () => null, setItem() {} }, URLSearchParams, AbortSignal, fetch: async () => ({ ok: true, json: async () => ({ enabled: true }) }),
    });
    for(let i=0;i<8;i++) await Promise.resolve();
    analyticsWindow.SpeechAnalytics.track('checkout_complete', { source: 'board', item_id: 'monthly', email: 'private@example.test', userId: 'private-id', value: 2.99, error: 'private error' });
    const event = Array.from(analyticsWindow.dataLayer.at(-1));
    assert.equal(event[1], 'checkout_complete');
    assert.deepEqual(JSON.parse(JSON.stringify(event[2])), { platform: 'web', item_id: 'monthly', source: 'board' });
    const countBeforeOptOut = analyticsWindow.dataLayer.length;
    analyticsWindow.SpeechAnalytics.setEnabled(false);
    analyticsWindow.SpeechAnalytics.track('checkout_complete', { item_id: 'monthly' });
    assert.equal(analyticsWindow.dataLayer.length, countBeforeOptOut + 1); // consent update only
    console.log('PASS analytics strips account, email, revenue, and error details; opt-out suppresses conversion events');
})().catch(err => { console.error(err); process.exitCode = 1; });
