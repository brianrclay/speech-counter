// Local candidate: only a boolean eligibility signal leaves the board controller.
(() => {
    'use strict';
    const billing = window.SpeechBilling;
    const link = document.getElementById('board-pro-link');
    if (!link || !billing || billing.platform() !== 'web') return;
    const key = 'speech-counter:post-clear-pro:v1';
    const tourKey = 'speech-counter:student-tour-dismissed:v1';
    const week = 7 * 24 * 60 * 60 * 1000;
    const card = document.createElement('section');
    card.className = 'board-pro-prompt';
    card.hidden = true;
    card.setAttribute('aria-label', 'Speech Count Pro suggestion');
    card.innerHTML = '<h2>Save your next session automatically</h2><p>With Pro, name a student and start counting. Keep session history, sync across devices, and export results for your next report.</p><div class="board-pro-prompt-actions"><a class="btn board-pro-prompt-cta" href="./students.html">See Pro plans</a><button class="btn btn-ghost board-pro-prompt-dismiss" type="button">Don’t show this suggestion again</button></div>';
    link.after(card);
    let generation = 0;
    let blocked = false;
    let clearGeneration = null;
    let clearId = null;
    function track(event) {
        window.SpeechAnalytics?.track(event, { prompt_id: 'web_post_clear_pro_v1', source: 'board' });
    }
    function hide() {
        generation++;
        card.hidden = true;
        link.classList.remove('post-clear-prompt-active');
    }
    function preference() {
        if (blocked || localStorage.getItem(tourKey) === 'true') return null;
        const value = JSON.parse(localStorage.getItem(key) || '{}');
        if (value.dismissed || (value.lastShown != null &&
            (!Number.isFinite(value.lastShown) || Date.now() - value.lastShown < week))) return null;
        return value;
    }
    window.addEventListener('speech:board-clear-start', event => {
        clearId = event.detail.id;
        hide();
        clearGeneration = generation;
    });
    window.addEventListener('speech:board-cleared', async event => {
        if (event.detail?.id !== clearId || clearGeneration !== generation || event.detail?.meaningful !== true) return;
        const request = generation;
        try {
            if (!preference()) return;
            // Do not infer free status from an absent/stale cached entitlement.
            const entitlement = await billing.refresh();
            if (document.visibilityState !== 'visible' || request !== generation || !entitlement || entitlement.active !== false ||
                window.SpeechStore.entitlements.isPremium() || !preference()) return;
            const saved = { lastShown: Date.now() };
            localStorage.setItem(key, JSON.stringify(saved));
            if (localStorage.getItem(key) !== JSON.stringify(saved)) return;
            card.hidden = false;
            link.classList.add('post-clear-prompt-active');
            track('board_pro_prompt_view');
        } catch (_) { if (request === generation) hide(); }
    });
    window.addEventListener('speech:board-undo', hide);
    window.addEventListener('speech:entitlement', () => {
        if (window.SpeechStore.entitlements.isPremium()) hide();
    });
    window.addEventListener('storage', event => {
        if (event.key === key || event.key === tourKey || event.key === null) hide();
    });
    for (const name of ['pointerdown', 'keydown', 'input']) {
        document.addEventListener(name, event => {
            if (event.target.closest?.('#row-wrapper, #add-row, #clear, #undo')) hide();
        }, true);
    }
    card.querySelector('a').addEventListener('click', () => track('board_pro_prompt_click'));
    card.querySelector('button').addEventListener('click', () => {
        blocked = true;
        try { localStorage.setItem(key, JSON.stringify({ dismissed: true })); } catch (_) {}
        hide();
        track('board_pro_prompt_dismiss');
    });
})();
