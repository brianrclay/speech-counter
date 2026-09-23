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
        <header class="feature-video-heading"><h2 id="feature-video-title">Meet your student features</h2><button type="button" class="feature-video-close" aria-label="Close video">×</button></header>
        <div class="feature-video-stage">
            <video muted playsinline webkit-playsinline preload="none" poster="./assets/video/student-features.jpg" aria-label="Pause video" role="button" tabindex="0" disablepictureinpicture></video>
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
    let opener;
    let dock;
    let anchor;
    let selected = billing.defaultPlan ? billing.defaultPlan() : 'lifetime';
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
            billing.track('paywall_cta_click', { item_id: selected, platform: billing.platform() });
            purchase(selected);
        });
        select(selected);
    } else {
        dock = document.querySelector('.pro-purchase-dock');
        anchor = document.createComment('Video purchase dock home');
        dock.before(anchor);
        // Restore the existing dock before the existing checkout handler opens sign-in.
        dock.querySelector('.btn-primary').addEventListener('click', close, true);
        window.addEventListener('speech:entitlement', close);
    }
    function setupBoardCard() {
        const card = document.querySelector('.feature-video-card');
        const store = window.SpeechStore;
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
            const visible = !dismissed && !usedBoard;
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
        dock.querySelector('#video-buy-label').textContent = id === 'monthly' ? 'Subscribe monthly' : 'Purchase lifetime';
        dock.querySelector('#video-buy-price').textContent = dock.querySelector('[data-price="' + id + '"]').textContent;
    }
    async function loadPrices() {
        try {
            packages = await billing.offerings();
            packages.forEach(pkg => {
                const price = dock.querySelector('[data-price="' + pkg.id + '"]');
                if (price && pkg.price) price.textContent = pkg.price + (pkg.id === 'monthly' ? '/mo' : '');
            });
            select(selected);
        } catch { /* The purchase handler provides a retryable status. */ }
    }
    async function purchase(id) {
        if (busy) return;
        const status = dock.querySelector('.paywall-status');
        const pkg = packages.find(item => item.id === id);
        if (!pkg) {
            status.textContent = "The store isn't available right now. Check your connection and try again.";
            loadPrices();
            return;
        }
        if (!window.SpeechAccount.session()) {
            close();
            window.SpeechSheet.open({ plan: dock.querySelector('[data-package="' + id + '"] .plan-body'), onSignedIn: () => purchase(id) });
            return;
        }
        busy = true;
        dock.querySelectorAll('button').forEach(button => { button.disabled = true; });
        status.textContent = '';
        close();
        try {
            const entitlement = await billing.purchase(pkg);
            if (entitlement && entitlement.active) {
                location.href = './students.html';
            } else if (entitlement) {
                open(opener, false);
                status.textContent = 'Your purchase is processing. You can restore purchases from the Students page.';
            }
        } catch (err) {
            open(opener, false);
            status.textContent = err.message || 'The purchase could not be completed. Please try again.';
        } finally {
            busy = false;
            dock.querySelectorAll('button').forEach(button => { button.disabled = false; });
        }
    }
    function open(trigger, autoplay = true) {
        if (dialog.open) return;
        opener = trigger;
        if (!board) dialog.append(dock);
        if (!video.getAttribute('src')) video.src = './assets/video/student-features.mp4';
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
            if (!premium) loadPrices();
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
    triggers.forEach(trigger => trigger.addEventListener('click', () => open(trigger)));
    dialog.querySelector('.feature-video-close').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
    function togglePlayback() {
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
    mute.addEventListener('click', () => { video.muted = !video.muted; updateSound(); });
    seek.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value); });
    ['play', 'pause', 'ended'].forEach(event => video.addEventListener(event, () => {
        video.setAttribute('aria-label', video.paused ? (video.ended ? 'Replay video' : 'Play video') : 'Pause video');
    }));
    video.addEventListener('timeupdate', () => { seek.value = video.currentTime; dialog.querySelector('.feature-video-time').textContent = '0:' + String(Math.floor(video.currentTime)).padStart(2, '0') + ' / 0:34'; });
    video.addEventListener('error', () => { error.textContent = 'The video could not load. Check your connection and reopen it to retry.'; video.removeAttribute('src'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
    window.addEventListener('pagehide', () => video.pause());
})();
