// Email + code sign-in sheet shared by the Students paywall and the Account
// page. Slides up from the bottom (a centered dialog on wide screens); the
// panel's height is tweened between the two steps so it grows rather than
// jumps. Callers pass an optional title, an element to echo above the form
// (the chosen plan), and what to do once signed in.
(() => {
    'use strict';

    const account = window.SpeechAccount;

    const sheet = document.getElementById('sheet');
    if (!sheet) return;
    const panel = sheet.querySelector('.sheet-panel');
    const form = document.getElementById('sheet-form');
    const title = document.getElementById('sheet-title');
    const planSlot = document.getElementById('sheet-plan');
    const steps = [...sheet.querySelectorAll('.sheet-step')];
    const emailField = document.getElementById('sheet-email');
    const codeField = document.getElementById('sheet-code');
    const status = document.getElementById('sheet-status');
    const submit = document.getElementById('sheet-submit');

    let step = 'email';
    let busy = false;
    let onSignedIn = null;
    let opener = null;
    let revision = 0;

    function reducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function showStep(next, animate) {
        step = next;
        const from = panel.offsetHeight;
        steps.forEach((el) => {
            el.hidden = el.dataset.step !== next;
            el.classList.remove('step-enter');
        });
        submit.textContent = next === 'email' ? 'Continue' : 'Sign in';
        if (!animate || reducedMotion()) return;
        const to = panel.offsetHeight;
        steps.find((el) => el.dataset.step === next).classList.add('step-enter');
        panel.style.transition = 'none';
        panel.style.height = from + 'px';
        panel.offsetHeight;
        panel.style.transition = '';
        panel.style.height = to + 'px';
        panel.addEventListener('transitionend', function onEnd(event) {
            if (event.propertyName !== 'height') return;
            panel.removeEventListener('transitionend', onEnd);
            panel.style.height = '';
        });
    }

    function setBusy(value) {
        busy = value;
        submit.disabled = value;
        emailField.disabled = value;
        codeField.disabled = value;
    }

    const behind = [...document.querySelectorAll('main, header.app-header, nav.tab-bar')];

    // The on-screen keyboard shrinks the visual viewport but not the layout
    // viewport a fixed element is placed in, so on phones the keyboard would
    // sit over the bottom of the panel. While open, the sheet tracks the
    // visual viewport instead.
    const viewport = window.visualViewport;

    function fitViewport() {
        if (sheet.hidden) return;
        sheet.style.top = viewport.offsetTop + 'px';
        sheet.style.height = viewport.height + 'px';
    }

    if (viewport) {
        viewport.addEventListener('resize', fitViewport);
        viewport.addEventListener('scroll', fitViewport);
    }

    function open(options) {
        revision += 1;
        onSignedIn = options.onSignedIn || null;
        opener = document.activeElement;
        behind.forEach((el) => { el.inert = true; });
        title.textContent = options.title || 'Create account to purchase';
        planSlot.hidden = !options.plan;
        planSlot.replaceChildren();
        if (options.plan) planSlot.appendChild(options.plan.cloneNode(true));
        emailField.value = '';
        codeField.value = '';
        status.textContent = '';
        setBusy(false);
        panel.style.height = '';
        showStep('email', false);
        sheet.hidden = false;
        if (viewport) fitViewport();
        sheet.offsetHeight;
        sheet.classList.add('open');
        setTimeout(() => emailField.focus(), reducedMotion() ? 0 : 320);
    }

    function close() {
        if (sheet.hidden) return;
        revision += 1;
        sheet.classList.remove('open');
        behind.forEach((el) => { el.inert = false; });
        const finish = () => {
            sheet.hidden = true;
            sheet.style.top = '';
            sheet.style.height = '';
            if (opener && opener.focus) opener.focus();
        };
        if (reducedMotion()) {
            finish();
            return;
        }
        panel.addEventListener('transitionend', function onEnd(event) {
            if (event.propertyName !== 'transform' && event.propertyName !== 'opacity') return;
            panel.removeEventListener('transitionend', onEnd);
            finish();
        });
    }

    document.getElementById('sheet-close').addEventListener('click', close);
    document.getElementById('sheet-backdrop').addEventListener('click', close);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !sheet.hidden) close();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy) return;
        status.textContent = '';
        const email = emailField.value.trim();
        if (!emailField.checkValidity() || !email) {
            status.textContent = 'Enter a valid email address.';
            emailField.focus();
            return;
        }
        setBusy(true);
        const submittedRevision = revision;
        try {
            if (step === 'email') {
                await account.requestCode(email);
                if (submittedRevision !== revision) return;
                showStep('code', true);
                setBusy(false);
                codeField.focus();
                return;
            }
            await account.verifyCode(email, codeField.value);
            // Closing the sheet cancels checkout even if email verification
            // finishes afterwards. The account may still have signed in.
            if (submittedRevision !== revision) return;
            const done = onSignedIn;
            close();
            if (done) done();
        } catch (err) {
            if (submittedRevision !== revision) return;
            status.textContent = err.message;
            setBusy(false);
            (step === 'code' ? codeField : emailField).focus();
        }
    });

    window.SpeechSheet = { open, close };
})();
