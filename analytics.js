// Explicit usage events only. GA stays web-only; PostHog also covers Capacitor.
// Never capture student data, free text, email, tokens, or payment details.
(() => {
    'use strict';
    const ID = 'G-QPE28RCTSV';
    const KEY = 'speech-counter:analytics';
    const production = location.protocol === 'https:' && ['speechcount.com', 'www.speechcount.com'].includes(location.hostname);
    const POSTHOG_KEY = 'phc_tVXpVbkKuccmtituA9YtNXfchPF2LPf86qSSJ5qt3Cpf';
    const SDK_VERSION = '1.435.6';
    function platform() {
        const c = window.Capacitor;
        return c?.isNativePlatform?.() ? c.getPlatform() : 'web';
    }
    function eligible() { return production || ['ios', 'android'].includes(platform()); }
    const events = new Set(['board_pro_prompt_view', 'board_pro_prompt_click', 'board_pro_prompt_dismiss', 'app_open','board_add', 'board_remove', 'board_clear', 'board_count', 'board_undo',
        'student_create', 'student_rename', 'student_delete', 'student_view', 'students_sort',
        'session_save', 'sync_complete', 'sync_error', 'session_edit', 'session_delete', 'export_data', 'paywall_view', 'paywall_cta_click', 'select_plan',
        'begin_checkout', 'checkout_cancel', 'checkout_error', 'checkout_complete', 'checkout_pending', 'plans_error',
        'sign_in_view', 'code_request', 'code_sent', 'sign_in_error', 'sign_in_cancel', 'sign_in_complete', 'pro_link_click',
        'demo_view', 'demo_export', 'demo_cta_click',
        'video_open', 'video_control', 'video_cta_click', 'video_plan_select', 'video_dismiss',
        'restore_purchases', 'redeem_code', 'sign_in', 'sign_out']);
    const values = { prompt_id: ['web_post_clear_pro_v1'], platform: ['web', 'ios', 'android'], item_id: ['lifetime', 'monthly'],
        experiment_id: ['web_default_plan_v1'], variant_id: ['monthly', 'lifetime'],
        video_id: ['student_features'], video_variant: ['mobile', 'desktop'],
        video_action: ['play', 'pause', 'replay', 'mute', 'unmute', 'seek', 'close'],
        stage: ['initialization', 'identity', 'payment', 'email', 'code'],
        format: ['csv', 'json'], result: ['active', 'inactive'], source: ['board', 'students'] };
    let trafficAllowed = null;
    const waiting = [];
    let policyGeneration = 0;
    let disabled = false;
    let initialized = false;
    function enabled() {
        if (!eligible() || disabled || trafficAllowed !== true) return false;
        try { return localStorage.getItem(KEY) !== 'off'; } catch (_) { return false; }
    }
    function initGA() {
        if (!production || !enabled() || initialized) return;
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
        if (trafficAllowed === null && eligible() && events.has(name)) {
            if (waiting.length < 100) waiting.push([name, params]);
            return;
        }
        if (!enabled() || !events.has(name)) return;
        initGA();
        const safe = { platform: 'web' };
        for (const [key, allowed] of Object.entries(values)) {
            if (allowed.includes(params[key])) safe[key] = params[key];
        }
        safe.platform = platform();
        if (production) window.gtag('event', name, safe);
        posthogCall('capture', name, safe);
    }
    let sdkLoading = false;
    let sdk = null;
    let identified = null;
    const pending = [];
    const route = location.pathname.includes('students') ? 'students' : location.pathname.includes('account') ? 'account' : location.pathname.includes('demo') ? 'demo' : 'board';
    const page = 'https://speechcount.com/' + (route === 'board' ? '' : route + '.html');
    function sanitize(event) {
        if (!event || !enabled() || (!events.has(event.event) && event.event !== '$identify')) return null;
        const input = event.properties || {};
        // PostHog requires its public project token on every event. This is
        // the publishable ingestion key, never an account/session credential.
        const safe = { token: POSTHOG_KEY, platform: platform(), page: route, environment: 'production', instrumentation_version: 'posthog_v1', $current_url: page, $ip: null };
        for (const [key, allowed] of Object.entries(values)) {
            if (allowed.includes(input[key])) safe[key] = input[key];
        }
        safe.platform = platform();
        // Preserve SDK identity/session plumbing; discard all automatic URL,
        // referrer, profile, form, browser-history, and arbitrary properties.
        for (const key of ['distinct_id', '$anon_distinct_id', '$device_id', '$session_id', '$window_id', '$lib', '$lib_version', '$is_identified', '$process_person_profile']) {
            if (input[key] !== undefined) safe[key] = input[key];
        }
        event.properties = safe;
        // The SDK can also attach profile/initial-URL properties outside
        // properties. Keep those out of our explicit, data-minimal events.
        delete event.$set;
        delete event.$set_once;
        delete event.$unset;
        return event;
    }
    function syncIdentity() {
        if (!sdk || !enabled()) return;
        const id = window.SpeechStore?.session.get()?.userId;
        const next = typeof id === 'string' && /^u_[a-f0-9]{32}$/.test(id) ? id : null;
        if (next === identified) return;
        if (identified) sdk.reset();
        identified = next;
        if (next) sdk.identify(next);
    }
    function posthogCall(method, ...args) {
        if (!enabled()) return;
        if (sdk) {
            syncIdentity();
            sdk[method](...args);
        } else {
            if (pending.length < 100) pending.push([method, args]);
            initPostHog();
        }
    }
    function initPostHog() {
        if (!enabled() || sdkLoading || sdk) return;
        sdkLoading = true;
        const script = document.createElement('script');
        script.async = true;
        script.src = 'vendor/posthog-' + SDK_VERSION + '.js';
        script.onerror = () => { sdkLoading = false; pending.length = 0; };
        script.onload = () => {
            sdkLoading = false;
            if (!enabled() || !window.posthog) { pending.length = 0; return; }
            sdk = window.posthog.init(POSTHOG_KEY, {
                api_host: 'https://us.i.posthog.com', ui_host: 'https://us.posthog.com',
                persistence: 'localStorage', person_profiles: 'identified_only',
                autocapture: false, capture_pageview: false, capture_pageleave: false,
                capture_dead_clicks: false, capture_heatmaps: false, capture_performance: false,
                capture_exceptions: false, disable_session_recording: true,
                enable_recording_console_log: false, disable_surveys: true,
                disable_external_dependency_loading: true, advanced_disable_flags: true,
                ip: false, before_send: sanitize,
                loaded: (client) => {
                    sdk = client;
                    syncIdentity();
                    while (pending.length && enabled()) {
                        const [method, args] = pending.shift();
                        client[method](...args);
                    }
                },
            });
        };
        document.head.appendChild(script);
    }
    function init() { initGA(); initPostHog(); }
    function setEnabled(value) {
        disabled = !value;
        try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch (_) { disabled = true; }
        window['ga-disable-' + ID] = !enabled();
        if (initialized) window.gtag('consent', 'update', { analytics_storage: enabled() ? 'granted' : 'denied' });
        if (sdk) {
            if (enabled()) sdk.opt_in_capturing();
            else { pending.length = 0; sdk.opt_out_capturing(); sdk.reset(); identified = null; }
        }
        init();
    }
    window.SpeechAnalytics = { track, enabled, setEnabled };
    async function checkTrafficPolicy() {
        const generation = ++policyGeneration;
        trafficAllowed = null;
        if (!eligible()) return;
        try {
            const userId = window.SpeechStore?.session.get()?.userId || null;
            const response = await fetch('https://speechcount.com/api/analytics-policy', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }), credentials: 'omit', cache: 'no-store',
                signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
            });
            if (!response.ok) throw new Error('Analytics policy unavailable');
            const policy = await response.json();
            if (generation !== policyGeneration) return;
            trafficAllowed = policy.enabled === true;
        } catch (_) {
            if (generation !== policyGeneration) return;
            trafficAllowed = false;
        }
        window['ga-disable-' + ID] = !enabled();
        if (!enabled()) { waiting.length = 0; pending.length = 0; return; }
        init();
        syncIdentity();
        while (waiting.length && enabled()) { const [name, params] = waiting.shift(); track(name, params); }
    }
    if (document.readyState !== 'loading') checkTrafficPolicy();
    window.addEventListener('speech:session', checkTrafficPolicy);
    document.addEventListener?.('DOMContentLoaded', () => {
        const ready = window.SpeechStore?.ready();
        Promise.resolve(ready).then(async () => { await checkTrafficPolicy(); track('app_open'); }).catch(() => {});
    });
    window.addEventListener('storage', (event) => {
        if (event.key === KEY) {
            setEnabled(event.newValue !== 'off');
        }
    });
})();
