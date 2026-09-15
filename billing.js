// RevenueCat wrapper shared by the board and the Students page. Native
// platforms go through the Purchases Capacitor plugin (App Store / Play
// billing); the web uses RevenueCat Web Billing loaded on demand from the
// CDN. Either way the result lands in SpeechStore.entitlements so the rest
// of the app only ever asks isPremium().
(() => {
    'use strict';

    const RC_KEYS = {
        ios: 'appl_REPLACE_ME',
        android: 'goog_REPLACE_ME',
        web: 'rcb_REPLACE_ME',
    };
    const WEB_SDK = 'https://cdn.jsdelivr.net/npm/@revenuecat/purchases-js@1.62.0/+esm';
    const ENTITLEMENT = 'roster';
    const ANON_KEY = 'speech-counter:rc-anon:v1';

    const store = window.SpeechStore;
    let impl = null;
    let readyPromise = null;

    function platform() {
        const capacitor = window.Capacitor;
        if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
            return capacitor.getPlatform();
        }
        return 'web';
    }

    function track(name, params) {
        if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
    }

    function iso(value) {
        if (!value) return null;
        if (value instanceof Date) return value.toISOString();
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    function toEntitlement(info) {
        const active = info && info.entitlements && info.entitlements.active && info.entitlements.active[ENTITLEMENT];
        return {
            active: Boolean(active && active.isActive !== false),
            productId: active ? active.productIdentifier || null : null,
            expiresAt: active ? iso(active.expirationDate) : null,
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
            return { id: PACKAGE_IDS[pkg.packageType] || pkg.identifier, price, raw: pkg };
        });
    }

    async function nativeImpl(name) {
        const Purchases = window.Capacitor.Plugins.Purchases;
        const session = store.session.get();
        const config = { apiKey: RC_KEYS[name] };
        if (session && session.userId) config.appUserID = session.userId;
        await Purchases.configure(config);
        Purchases.addCustomerInfoUpdateListener((info) => remember(info)).catch(() => {});
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

    async function webImpl() {
        const { Purchases } = await import(WEB_SDK);
        const session = store.session.get();
        const purchases = Purchases.isConfigured()
            ? Purchases.getSharedInstance()
            : Purchases.configure(RC_KEYS.web, (session && session.userId) || anonymousId(Purchases));
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

    async function refresh() {
        await ready();
        return remember(await impl.customerInfo());
    }

    async function purchase(pkg) {
        await ready();
        track('begin_checkout', { item_id: pkg.id, platform: platform() });
        try {
            const entitlement = remember(await impl.purchase(pkg));
            if (entitlement.active) track('purchase', { item_id: pkg.id, platform: platform() });
            return entitlement;
        } catch (err) {
            if (cancelled(err)) return null;
            throw err;
        }
    }

    async function restore() {
        await ready();
        return remember(await impl.restore());
    }

    async function logIn(userId) {
        await ready();
        return remember(await impl.logIn(userId));
    }

    async function logOut() {
        await ready();
        return remember(await impl.logOut());
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
        canRestore: () => Boolean(impl && impl.canRestore),
        ENTITLEMENT,
    };
})();
