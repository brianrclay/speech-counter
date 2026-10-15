(() => {
    'use strict';
    const triggers = [...document.querySelectorAll('[data-feature-video]')];
    if (!triggers.length) return;
    const billing = window.SpeechBilling;
    const board = document.body.classList.contains('board-page');
    const dialog = document.createElement('dialog');
    dialog.className = 'feature-video-dialog';
    dialog.setAttribute('aria-labelledby', 'feature-video-title');
    dialog.innerHTML = `
        <header class="feature-video-heading"><h2 id="feature-video-title">Save sessions. See progress.</h2><button type="button" class="feature-video-close" aria-label="Close video">×</button></header>
        <div class="feature-video-stage">
            <video muted playsinline webkit-playsinline preload="none" poster="./assets/video/student-features-mobile-v5.jpg" aria-label="Pause video" role="button" tabindex="0" disablepictureinpicture></video>
            <div><div class="feature-video-controls">
                <input type="range" min="0" max="34" step="0.1" value="0" aria-label="Video progress in seconds">
                <span class="feature-video-time">0:00 / 0:34</span>
                <button type="button" data-mute aria-label="Unmute music" title="Unmute music"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path data-sound-off d="m16 9 6 6m0-6-6 6"/><path data-sound-on d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" hidden/></svg></button>
            </div><p class="feature-video-error" role="status"></p></div>
        </div>`;
    document.body.append(dialog);
    const video = dialog.querySelector('video');
    video.muted = true;
    const mute = dialog.querySelector('[data-mute]');
    const seek = dialog.querySelector('input');
    const error = dialog.querySelector('.feature-video-error');
    let videoVariant;
    function trackVideo(name, params = {}) {
        billing.track(name, {
            source: board ? 'board' : 'students',
            platform: billing.platform(),
            video_id: 'student_features',
            video_variant: videoVariant || (window.matchMedia('(min-width: 900px)').matches ? 'desktop' : 'mobile'),
            ...params,
        });
    }
    function trackPurchase() {
        const plan = dock.querySelector('.plan[aria-checked="true"]');
        trackVideo('video_cta_click', { item_id: plan?.dataset.package });
    }
    let opener;
    let dock;
    let anchor;
    let selected = 'lifetime';
    let paywallViewed = false;
    let pricesLoading = null;
    let packages = [];
    let busy = false;
    if (board) {
        setupBoardCard();
        dock = document.getElementById('video-purchase-template').content.firstElementChild.cloneNode(true);
        dialog.append(dock);
        dock.insertAdjacentHTML('beforeend', '<p class="feature-video-terms">Monthly renews until canceled. <a href="./terms.html" target="_blank" rel="noopener">Terms</a> · <a href="./privacy.html" target="_blank" rel="noopener">Privacy</a></p>');
        dock.querySelectorAll('.plan').forEach(button => {
            button.addEventListener('click', () => select(button.dataset.package));
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                select(selected === 'lifetime' ? 'monthly' : 'lifetime');
                dock.querySelector('[data-package="' + selected + '"]').focus();
            });
        });
        dock.querySelector('.btn-primary').addEventListener('click', () => {
            trackPurchase();
            billing.track('paywall_cta_click', { source: 'board', item_id: selected, platform: billing.platform() });
            purchase(selected);
        });
        select(selected);
    } else {
        dock = document.querySelector('.pro-purchase-dock');
        anchor = document.createComment('Video purchase dock home');
        dock.before(anchor);
        // Restore the existing dock before the existing checkout handler opens sign-in.
        dock.querySelector('.btn-primary').addEventListener('click', () => {
            if (dialog.open) trackPurchase();
            close();
        }, true);
        window.addEventListener('speech:entitlement', close);
    }
    // Listen after plan handlers update aria-checked. Programmatic defaults and
    // price refreshes do not count as user selections.
    function trackPlan(event) {
        if (!dialog.open || !event.target.closest('.plan')) return;
        if (event.type === 'keydown' && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const plan = dock.querySelector('.plan[aria-checked="true"]');
        trackVideo('video_plan_select', { item_id: plan?.dataset.package });
        if (board) billing.track('select_plan', { source: 'board', item_id: plan?.dataset.package, platform: billing.platform() });
    }
    dock.addEventListener('click', trackPlan);
    dock.addEventListener('keydown', trackPlan);
    function setupBoardCard() {
        const card = document.querySelector('.feature-video-card');
        const store = window.SpeechStore;
        const proLink = document.getElementById('board-pro-link');
        proLink.addEventListener('click', () => billing.track('pro_link_click', { source: 'board', platform: billing.platform() }));
        const key = 'speech-counter:student-tour-dismissed:v1';
        const preferences = window.Capacitor?.isNativePlatform?.()
            ? window.Capacitor.Plugins?.Preferences : null;
        let dismissed = false;
        let usedBoard = false;
        let ready = false;
        function update() {
            if (!ready) return;
            const rows = store.board.load() || [];
            usedBoard = usedBoard || store.students.list().length > 0 || rows.length > 1
                || rows.some(row => String(row.name || '').trim());
            const premium = store.entitlements.isPremium();
            const visible = !premium && !dismissed && !usedBoard;
            proLink.hidden = premium || visible;
            card.hidden = !visible;
            document.body.classList.toggle('has-feature-video-card', visible);
        }
        async function readDismissal() {
            try { dismissed = localStorage.getItem(key) === 'true'; } catch { /* Storage may be unavailable. */ }
            if (preferences) {
                try { dismissed = dismissed || (await preferences.get({ key })).value === 'true'; } catch { /* Keep the local fallback. */ }
            }
        }
        card.querySelector('.feature-video-dismiss').addEventListener('click', () => {
            trackVideo('video_dismiss');
            dismissed = true;
            update();
            try { localStorage.setItem(key, 'true'); } catch { /* Still hide for this visit. */ }
            if (preferences) preferences.set({ key, value: 'true' }).catch(() => {});
            document.getElementById('add-row').focus({ preventScroll: true });
        });
        document.getElementById('add-row').addEventListener('click', () => {
            usedBoard = true;
            update();
        });
        store.onPersist(name => { if (name === 'board' || name === 'students') update(); });
        window.addEventListener('speech:changed', update);
        window.addEventListener('speech:entitlement', update);
        window.addEventListener('storage', event => {
            if (event.key === key && event.newValue === 'true') { dismissed = true; update(); }
        });
        Promise.all([store.ready(), readDismissal()]).then(() => { ready = true; update(); });
    }
    function select(id) {
        selected = id;
        dock.querySelectorAll('.plan').forEach(button => {
            const active = button.dataset.package === id;
            button.setAttribute('aria-checked', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        const available = packages.some(pkg => pkg.id === id);
        dock.querySelector('#video-buy-label').textContent = pricesLoading ? 'Loading plans…' : available ? (id === 'monthly' ? 'Subscribe monthly' : 'Purchase lifetime') : 'Retry loading plans';
        dock.querySelector('.btn-primary').disabled = busy || Boolean(pricesLoading);
        dock.querySelector('#video-buy-price').textContent = dock.querySelector('[data-price="' + id + '"]').textContent;
    }
    function loadPrices() {
        if (pricesLoading) return pricesLoading;
        const status = dock.querySelector('.paywall-status');
        status.textContent = 'Loading plans…';
        dock.querySelectorAll('[data-price]').forEach(price => { price.textContent = '—'; });
        dock.querySelector('.btn-primary').disabled = true;
        pricesLoading = billing.offerings().then(plans => {
            packages = plans;
            packages.forEach(pkg => {
                const price = dock.querySelector('[data-price="' + pkg.id + '"]');
                if (price) price.textContent = pkg.price + (pkg.id === 'monthly' ? '/mo' : '');
            });
            status.textContent = '';
            return plans;
        }).catch(err => {
            packages = [];
            status.textContent = 'Plans could not load. Check your connection, then tap Retry loading plans.';
            billing.track('plans_error', { source: 'board', platform: billing.platform() });
            throw err;
        }).finally(() => {
            pricesLoading = null;
            select(selected);
        });
        select(selected);
        return pricesLoading;
    }
    async function purchase(id) {
        if (busy) return;
        busy = true;
        const status = dock.querySelector('.paywall-status');
        dock.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
            if (!packages.some(pkg => pkg.id === id)) await loadPrices();
            const pkg = packages.find(item => item.id === id);
            if (!pkg) {
                status.textContent = 'This plan is unavailable right now. Choose the other plan or retry later.';
                return;
            }
            if (!window.SpeechAccount.session()) {
                close();
                window.SpeechSheet.open({ source: 'board', plan: dock.querySelector('[data-package="' + id + '"] .plan-body'), onSignedIn: () => purchase(id) });
                return;
            }
            status.textContent = '';
            close();
            const entitlement = await billing.purchase(pkg, { source: 'board' });
            if (entitlement && entitlement.active) {
                location.href = './students.html';
            } else if (entitlement) {
                open(opener, false);
                status.textContent = 'Your purchase is processing. Sign in again in a moment to check your Pro access.';
            } else {
                open(opener, false);
            }
        } catch (err) {
            if (!dialog.open) open(opener, false);
            status.textContent = err.message || 'The purchase could not be completed. Please try again.';
        } finally {
            busy = false;
            dock.querySelectorAll('button').forEach(button => { button.disabled = false; });
            select(selected);
        }
    }
    function open(trigger, autoplay = true) {
        if (dialog.open) return;
        opener = trigger;
        if (!board) dialog.append(dock);
        // Choose on open, so resizing or rotating never interrupts playback.
        const variant = window.matchMedia('(min-width: 900px)').matches ? 'desktop' : 'mobile';
        videoVariant = variant;
        const source = './assets/video/student-features-' + variant + '-v5.mp4';
        if (video.getAttribute('src') !== source) {
            video.poster = './assets/video/student-features-' + variant + '-v5.jpg';
            video.src = source;
            seek.value = 0;
            dialog.querySelector('.feature-video-time').textContent = '0:00 / 0:34';
        }
        error.textContent = '';
        dock.inert = false;
        dock.removeAttribute('aria-hidden');
        dock.classList.remove('is-offscreen');
        dialog.showModal();
        window.dispatchEvent(new Event('speech:feature-video'));
        document.body.classList.add('feature-video-open');
        video.muted = true;
        updateSound();
        if (video.ended) video.currentTime = 0;
        if (autoplay) video.play().catch(() => { video.setAttribute('aria-label', 'Play video'); });
        if (board) {
            const premium = window.SpeechStore.entitlements.isPremium();
            dock.hidden = premium;
            dialog.classList.toggle('is-premium', premium);
            if (!premium) {
                if (!paywallViewed) {
                    selected = billing.defaultPlan();
                    select(selected);
                    paywallViewed = true;
                    billing.track('paywall_view', { source: 'board', platform: billing.platform() });
                }
                if (!packages.length && !pricesLoading) loadPrices().catch(() => {});
            }
        }
    }
    function restore() {
        video.pause();
        document.body.classList.remove('feature-video-open');
        if (!board && anchor) anchor.after(dock);
        window.dispatchEvent(new Event('speech:feature-video'));
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    }
    function close() {
        if (!dialog.open) return;
        dialog.close();
        restore();
    }
    triggers.forEach(trigger => trigger.addEventListener('click', () => {
        if (dialog.open) return;
        open(trigger);
        trackVideo('video_open');
    }));
    function dismissVideo() {
        trackVideo('video_control', { video_action: 'close' });
        close();
    }
    dialog.querySelector('.feature-video-close').addEventListener('click', dismissVideo);
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismissVideo(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dismissVideo(); } });
    function togglePlayback() {
        trackVideo('video_control', { video_action: video.paused ? (video.ended ? 'replay' : 'play') : 'pause' });
        if (video.paused) {
            if (video.ended) video.currentTime = 0;
            video.play().catch(() => { error.textContent = 'Unable to play. Please try again.'; });
        } else video.pause();
    }
    function updateSound() {
        const label = video.muted ? 'Unmute music' : 'Mute music';
        mute.setAttribute('aria-label', label);
        mute.title = label;
        mute.querySelector('[data-sound-off]').style.display = video.muted ? '' : 'none';
        mute.querySelector('[data-sound-on]').style.display = video.muted ? 'none' : '';
        mute.querySelector('[data-sound-on]').removeAttribute('hidden');
    }
    video.addEventListener('click', togglePlayback);
    video.addEventListener('keydown', event => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); togglePlayback(); }
    });
    mute.addEventListener('click', () => { video.muted = !video.muted; updateSound(); trackVideo('video_control', { video_action: video.muted ? 'mute' : 'unmute' }); });
    seek.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value); });
    seek.addEventListener('change', () => trackVideo('video_control', { video_action: 'seek' }));
    ['play', 'pause', 'ended'].forEach(event => video.addEventListener(event, () => {
        video.setAttribute('aria-label', video.paused ? (video.ended ? 'Replay video' : 'Play video') : 'Pause video');
    }));
    video.addEventListener('timeupdate', () => { seek.value = video.currentTime; dialog.querySelector('.feature-video-time').textContent = '0:' + String(Math.floor(video.currentTime)).padStart(2, '0') + ' / 0:34'; });
    video.addEventListener('error', () => { error.textContent = 'The video could not load. Check your connection and reopen it to retry.'; video.removeAttribute('src'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
    window.addEventListener('pagehide', () => video.pause());
})();
