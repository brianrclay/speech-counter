// Web analytics only. Never pass roster data, free text, or account IDs to GA.
(() => {
    'use strict';
    const ID = 'G-QPE28RCTSV';
    const KEY = 'speech-counter:analytics';
    const production = location.protocol === 'https:' && ['speechcount.com', 'www.speechcount.com'].includes(location.hostname);
    const events = new Set(['board_add', 'board_remove', 'board_clear', 'board_count', 'board_undo',
        'student_create', 'student_rename', 'student_delete', 'student_view', 'students_sort',
        'session_save', 'sync_complete', 'sync_error', 'session_edit', 'session_delete', 'export_data', 'paywall_view', 'paywall_cta_click', 'select_plan',
        'begin_checkout', 'checkout_complete', 'checkout_cancel', 'checkout_error',
        'restore_purchases', 'redeem_code', 'sign_in', 'sign_out']);
    const values = { platform: ['web', 'ios', 'android'], item_id: ['lifetime', 'monthly'],
        experiment_id: ['web_default_plan_v1'], variant_id: ['monthly', 'lifetime'],
        format: ['csv', 'json'], result: ['active', 'inactive'], source: ['board', 'students'] };
    let disabled = false;
    let initialized = false;
    let preferenceVersion = 0;
    let queue = Promise.resolve();
    function enabled() {
        if (!production || disabled) return false;
        try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return false; }
    }
    function purchaseKey() {
        const id = window.SpeechStore?.session.get()?.userId;
        return id ? 'speech-counter:purchase-analytics:' + id : null;
    }
    function purchaseChoice() {
        try { const key = purchaseKey(); return key ? localStorage.getItem(key) : null; } catch (_) { return null; }
    }
    function purchaseEnabled() { return enabled() && purchaseChoice() === 'on'; }
    async function setPurchaseEnabled(value) {
        const key = purchaseKey();
        if (!key) return false;
        try { localStorage.setItem(key, value ? 'on' : 'off'); } catch (_) { return false; }
        preferenceVersion += 1;
        return syncContext(true);
    }
    async function preparePurchase() {
        if (!production || !purchaseKey()) return;
        if (enabled() && purchaseChoice() === null) {
            const agreed = window.confirm('Help improve Speech Count by linking your website visits and chosen default plan to purchases, renewals, and refunds in Google Analytics? We store this link with your account, but never send your email or student data to Google. This is optional; Cancel continues your purchase without revenue analytics. You can change this on Account → Privacy.');
            await setPurchaseEnabled(agreed);
        }
        return syncContext();
    }
    function init() {
        if (!enabled() || initialized) return;
        initialized = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
        window.gtag('js', new Date());
        const campaigns = {};
        const query = new URLSearchParams(location.search || '');
        for (const field of ['source', 'medium', 'name', 'id', 'content', 'term']) {
            const value = query.get('utm_' + (field === 'name' ? 'campaign' : field));
            if (value && /^[a-zA-Z0-9_. -]{1,100}$/.test(value)) campaigns['campaign_' + field] = value;
        }
        window.gtag('config', ID, {
            ...campaigns,
            allow_google_signals: false, allow_ad_personalization_signals: false,
            // Student-detail hashes and arbitrary query parameters are excluded.
            page_location: location.origin + location.pathname,
            page_title: location.pathname.includes('students') ? 'Students - Speech Count' : location.pathname.includes('account') ? 'Account - Speech Count' : 'Speech Count',
            page_referrer: document.referrer ? document.referrer.split(/[?#]/)[0] : '',
        });
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
        document.head.appendChild(script);
    }
    function track(name, params = {}) {
        if (!enabled() || !events.has(name)) return;
        init();
        const safe = { platform: 'web' };
        for (const [key, allowed] of Object.entries(values)) {
            if (allowed.includes(params[key])) safe[key] = params[key];
        }
        window.gtag('event', name, safe);
    }
    function get(field) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 800);
            window.gtag('get', ID, field, (value) => { clearTimeout(timer); resolve(value); });
        });
    }
    // Persist the GA identifiers before checkout, so the webhook can report a
    // payment even if the tab closes. Failures never prevent a purchase.
    function syncContext(explicitPreference = false) {
        const run = async () => {
            const account = window.SpeechAccount;
            const session = window.SpeechStore?.session.get();
            if (!production || !account || !session?.token) return;
            const version = preferenceVersion;
            let body = { enabled: false };
            if (purchaseEnabled()) {
                init();
                const [clientId, sessionId] = await Promise.all([get('client_id'), get('session_id')]);
                if (version !== preferenceVersion) return;
                if (!purchaseEnabled()) body = { enabled: false };
                else if (!/^\d+\.\d+$/.test(clientId || '')) return;
                else body = { enabled: true, clientId, sessionId: String(sessionId || ''), consentVersion: 'purchase-v1',
                    ...window.SpeechBilling?.experimentContext() };
            }
            body.explicitPreference = explicitPreference;
            if (window.SpeechStore.session.get()?.token !== session.token) return;
            try {
                const result = await account.call('/api/analytics-context', body, session.token, { signal: AbortSignal.timeout(1500) });
                if (result.enabled === false && body.enabled) {
                    // A server-side opt-out wins over a stale device preference.
                    try { localStorage.setItem(purchaseKey(), 'off'); } catch (_) {}
                }
                return true;
            } catch (_) { return false; }
        };
        queue = queue.catch(() => {}).then(run);
        return queue;
    }
    async function setEnabled(value) {
        preferenceVersion += 1;
        disabled = !value;
        try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch (_) { disabled = true; }
        window['ga-disable-' + ID] = !enabled();
        if (initialized) window.gtag('consent', 'update', { analytics_storage: enabled() ? 'granted' : 'denied' });
        init();
        return syncContext(true);
    }
    window.SpeechAnalytics = { track, enabled, setEnabled, syncContext, purchaseEnabled, setPurchaseEnabled, preparePurchase };
    init();
    window.addEventListener('speech:session', () => { syncContext(); });
    window.addEventListener('online', () => { syncContext(); });
    window.addEventListener('storage', (event) => {
        if (event.key === KEY) {
            disabled = false;
            preferenceVersion += 1;
            window['ga-disable-' + ID] = !enabled();
            if (initialized) window.gtag('consent', 'update', { analytics_storage: enabled() ? 'granted' : 'denied' });
            init();
            syncContext();
        }
    });
    document.addEventListener('DOMContentLoaded', () => { window.SpeechStore?.ready().then(syncContext); });
})();
