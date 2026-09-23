// RevenueCat wrapper shared by the board and the Students page. Native
// platforms go through the Purchases Capacitor plugin (App Store / Play
// billing); the web uses RevenueCat Web Billing loaded on demand from the
// CDN. Either way the result lands in SpeechStore.entitlements so the rest
// of the app only ever asks isPremium().
(() => {
    'use strict';

    // Public keys - safe to ship. Web Billing has separate sandbox (Stripe
    // test mode) and production keys; local and branch deploys use sandbox.
    const RC_KEYS = {
        ios: 'appl_QGwnbqSLbClvYWDWwzUkWoArVfV',
        android: 'goog_REPLACE_ME',
        web: 'rcb_RlkuVnpvDcfcpEuheXqslQYZMvwf',
        webSandbox: 'rcb_sb_dozJljYQoIxpihkQscyZdIkhh',
    };
    const WEB_SDK = 'https://cdn.jsdelivr.net/npm/@revenuecat/purchases-js@1.62.0/+esm';
    const ENTITLEMENT = 'roster';
    const ANON_KEY = 'speech-counter:rc-anon:v1';

    const store = window.SpeechStore;
    let impl = null;
    let readyPromise = null;
    let operationQueue = Promise.resolve();

    // Identity changes and store operations must complete in order. In
    // particular, a background refresh must not race sign-in or checkout.
    function serial(operation) {
        const result = operationQueue.then(operation);
        operationQueue = result.catch(() => {});
        return result;
    }

    function platform() {
        const capacitor = window.Capacitor;
        if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
            return capacitor.getPlatform();
        }
        return 'web';
    }

    const PLAN_EXPERIMENT = 'web_default_plan_v1';
    const PLAN_EXPERIMENT_ENABLED = true;
    let planVariant = null;

    // Enroll only when a paywall is displayed. Storage must work so a
    // returning browser cannot silently cross between experiment groups.
    function defaultPlan() {
        if (!PLAN_EXPERIMENT_ENABLED || platform() !== 'web') return 'lifetime';
        if (planVariant) return planVariant;
        try {
            if (localStorage.getItem('speech-counter:analytics') === 'off') return 'lifetime';
            const key = 'speech-counter:experiment:' + PLAN_EXPERIMENT;
            let variant = localStorage.getItem(key);
            if (variant !== 'monthly' && variant !== 'lifetime') {
                variant = Math.random() < 0.5 ? 'lifetime' : 'monthly';
                localStorage.setItem(key, variant);
            }
            planVariant = variant;
        } catch (err) {
            return 'lifetime';
        }
        return planVariant;
    }

    function track(name, params) {
        const experiment = planVariant ? { experiment_id: PLAN_EXPERIMENT, variant_id: planVariant } : {};
        window.SpeechAnalytics?.track(name, { ...params, ...experiment });
    }

    function iso(value) {
        if (!value) return null;
        if (value instanceof Date) return value.toISOString();
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    // A promotional grant (coupon) with "lifetime" duration comes back from
    // RevenueCat with an expiry two centuries out; treat that as no expiry.
    const FOREVER_MS = 50 * 365 * 24 * 60 * 60 * 1000;

    function expiry(value) {
        const date = iso(value);
        return date && new Date(date).getTime() - Date.now() > FOREVER_MS ? null : date;
    }

    function toEntitlement(info) {
        const active = info && info.entitlements && info.entitlements.active && info.entitlements.active[ENTITLEMENT];
        const productId = active ? active.productIdentifier || null : null;
        return {
            active: Boolean(active && active.isActive !== false),
            productId,
            promo: /^rc_promo_/.test(productId || ''),
            expiresAt: active ? expiry(active.expirationDate) : null,
            willRenew: Boolean(active && active.willRenew),
            billingIssueAt: active ? iso(active.billingIssueDetectedAt) : null,
            managementURL: (info && info.managementURL) || null,
            appUserId: (info && info.originalAppUserId) || null,
        };
    }

    function remember(info) {
        const entitlement = toEntitlement(info);
        store.entitlements.set(entitlement);
        return entitlement;
    }

    function cancelled(err) {
        return Boolean(err && (err.userCancelled || String(err.code) === '1' || err.errorCode === 1));
    }

    const PACKAGE_IDS = { LIFETIME: 'lifetime', MONTHLY: 'monthly', $rc_lifetime: 'lifetime', $rc_monthly: 'monthly' };

    function normalizePackages(offerings) {
        const current = offerings && offerings.current;
        const packages = (current && current.availablePackages) || [];
        return packages.map((pkg) => {
            const product = pkg.product || pkg.webBillingProduct || pkg.rcBillingProduct || {};
            const price = product.priceString || (product.currentPrice && product.currentPrice.formattedPrice) || '';
            return { id: PACKAGE_IDS[pkg.packageType] || pkg.identifier, price, productId: product.identifier || null, raw: pkg };
        });
    }

    async function nativeImpl(name) {
        const Purchases = window.Capacitor.Plugins.Purchases;
        const session = store.session.get();
        const config = { apiKey: RC_KEYS[name] };
        if (session && session.userId) config.appUserID = session.userId;
        await Purchases.configure(config);
        // The bridge hands back a callback id here, not a promise, so nothing
        // may assume this is thenable: a throw on this line leaves impl unset
        // and takes every other billing call down with it. The listener only
        // catches renewals that land mid-session - purchase, restore, and
        // sign-in all refresh on their own.
        try {
            const registered = Purchases.addCustomerInfoUpdateListener((info) => remember(info));
            if (registered && typeof registered.catch === 'function') registered.catch(() => {});
        } catch (err) {
            // Same as above.
        }
        return {
            async customerInfo() {
                return (await Purchases.getCustomerInfo()).customerInfo;
            },
            async offerings() {
                return normalizePackages(await Purchases.getOfferings());
            },
            async purchase(pkg) {
                return (await Purchases.purchasePackage({ aPackage: pkg.raw })).customerInfo;
            },
            async restore() {
                return (await Purchases.restorePurchases()).customerInfo;
            },
            async logIn(userId) {
                return (await Purchases.logIn({ appUserID: userId })).customerInfo;
            },
            async logOut() {
                return (await Purchases.logOut()).customerInfo;
            },
            canRestore: true,
        };
    }

    function anonymousId(Purchases) {
        let id = null;
        try {
            id = localStorage.getItem(ANON_KEY);
        } catch (err) {
            // Storage unavailable - a fresh id each visit is fine.
        }
        if (!id) {
            id = Purchases.generateRevenueCatAnonymousAppUserId();
            try {
                localStorage.setItem(ANON_KEY, id);
            } catch (err) {
                // Same as above.
            }
        }
        return id;
    }

    // Staging uses the sandbox key (Stripe test mode) unless the tester opts
    // into live billing for that browser with
    // localStorage.setItem('speech-counter:rc-live', '1'). Production always
    // uses the live key.
    function webKey() {
        const host = location.hostname;
        const staging = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.netlify.app');
        if (!staging) return RC_KEYS.web;
        try {
            if (localStorage.getItem('speech-counter:rc-live') === '1') return RC_KEYS.web;
        } catch (err) {
            // Storage unavailable - stay on sandbox.
        }
        return RC_KEYS.webSandbox;
    }

    async function webImpl() {
        const { Purchases } = await import(WEB_SDK);
        const session = store.session.get();
        const purchases = Purchases.isConfigured()
            ? Purchases.getSharedInstance()
            : Purchases.configure(webKey(), (session && session.userId) || anonymousId(Purchases));
        return {
            customerInfo: () => purchases.getCustomerInfo(),
            async offerings() {
                return normalizePackages(await purchases.getOfferings());
            },
            async purchase(pkg) {
                const session = store.session.get();
                return (await purchases.purchase({ rcPackage: pkg.raw, customerEmail: session && session.email })).customerInfo;
            },
            restore: () => purchases.getCustomerInfo(),
            logIn: (userId) => purchases.changeUser(userId),
            logOut: () => purchases.changeUser(anonymousId(Purchases)),
            canRestore: false,
        };
    }

    function ready() {
        if (readyPromise) return readyPromise;
        readyPromise = store.ready().then(async () => {
            const name = platform();
            impl = name === 'web' ? await webImpl() : await nativeImpl(name);
            return impl;
        });
        return readyPromise;
    }

    async function accountInfo(required = false) {
        const session = store.session.get();
        if (!session || !session.userId) {
            if (required) throw new Error('Sign in or create an account to continue.');
            return impl.customerInfo();
        }
        // Sign-in can succeed while RevenueCat is offline. Retry identity
        // here, and never open checkout if identifying the account fails.
        const info = await impl.logIn(session.userId);
        if (store.session.get()?.userId !== session.userId) {
            throw new Error('Your account changed. Please try again.');
        }
        return info;
    }

    function refresh() {
        return serial(async () => {
            await ready();
            return remember(await accountInfo());
        });
    }

    function purchase(pkg) {
        return serial(async () => {
            await ready();
            const existing = remember(await accountInfo(true));
            // Signing in may recover an existing purchase from another
            // device or alias a legacy anonymous purchase. Don't charge again.
            if (existing.active) return existing;
            track('begin_checkout', { item_id: pkg.id, platform: platform() });
            try {
                const entitlement = remember(await impl.purchase(pkg));
                return entitlement;
            } catch (err) {
                if (cancelled(err)) return null;
                throw err;
            }
        });
    }

    function restore() {
        return serial(async () => {
            await ready();
            await accountInfo(true);
            return remember(await impl.restore());
        });
    }

    function logIn(userId) {
        return serial(async () => {
            await ready();
            if (store.session.get()?.userId !== userId) throw new Error('Your account changed. Please try again.');
            return remember(await accountInfo(true));
        });
    }

    function logOut() {
        return serial(async () => {
            await ready();
            return remember(await impl.logOut());
        });
    }

    async function offerings() {
        await ready();
        return impl.offerings();
    }

    // The board only needs to notice a lapsed subscription, so it refreshes
    // when the cached answer says premium and never loads the web SDK
    // otherwise. The Students page always refreshes.
    function refreshIfPremium() {
        store.ready().then(() => {
            if (store.entitlements.isPremium() || platform() !== 'web') refresh().catch(() => {});
        });
    }

    window.SpeechBilling = {
        platform,
        ready,
        refresh,
        refreshIfPremium,
        offerings,
        purchase,
        restore,
        logIn,
        logOut,
        track,
        defaultPlan,
        canRestore: () => Boolean(impl && impl.canRestore),
        ENTITLEMENT,
    };
})();
