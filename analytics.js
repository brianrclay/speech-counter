// Web analytics only. Never pass roster data, free text, or account IDs to GA.
(() => {
    'use strict';
    const ID = 'G-QPE28RCTSV';
    const KEY = 'speech-counter:analytics';
    const production = location.protocol === 'https:' && ['speechcount.com', 'www.speechcount.com'].includes(location.hostname);
    const events = new Set(['board_add', 'board_remove', 'board_clear', 'board_count', 'board_undo',
        'student_create', 'student_rename', 'student_delete', 'student_view', 'students_sort',
        'session_save', 'sync_complete', 'sync_error', 'session_edit', 'session_delete', 'export_data', 'paywall_view', 'paywall_cta_click', 'select_plan',
        'begin_checkout', 'checkout_cancel', 'checkout_error',
        'video_open', 'video_control', 'video_cta_click', 'video_plan_select', 'video_dismiss',
        'restore_purchases', 'redeem_code', 'sign_in', 'sign_out']);
    const values = { platform: ['web', 'ios', 'android'], item_id: ['lifetime', 'monthly'],
        experiment_id: ['web_default_plan_v1'], variant_id: ['monthly', 'lifetime'],
        video_id: ['student_features'], video_variant: ['mobile', 'desktop'],
        video_action: ['play', 'pause', 'replay', 'mute', 'unmute', 'seek', 'close'],
        format: ['csv', 'json'], result: ['active', 'inactive'], source: ['board', 'students'] };
    let disabled = false;
    let initialized = false;
    function enabled() {
        if (!production || disabled) return false;
        try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return false; }
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
    function setEnabled(value) {
        disabled = !value;
        try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch (_) { disabled = true; }
        window['ga-disable-' + ID] = !enabled();
        if (initialized) window.gtag('consent', 'update', { analytics_storage: enabled() ? 'granted' : 'denied' });
        init();
    }
    window.SpeechAnalytics = { track, enabled, setEnabled };
    init();
    window.addEventListener('storage', (event) => {
        if (event.key === KEY) {
            disabled = false;
            window['ga-disable-' + ID] = !enabled();
            if (initialized) window.gtag('consent', 'update', { analytics_storage: enabled() ? 'granted' : 'denied' });
            init();
        }
    });
})();
