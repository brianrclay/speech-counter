// Email + code sign-in. The identity it produces is both the RevenueCat app
// user id (so purchases follow the person) and the sync account. Nothing
// here runs until the user asks to sign in.
(() => {
    'use strict';

    const store = window.SpeechStore;
    const billing = window.SpeechBilling;

    function apiBase() {
        try {
            const override = localStorage.getItem('speech-counter:api-base');
            if (override) return override;
        } catch (err) {
            // ignore
        }
        if (billing.platform() !== 'web') return 'https://speechcount.com';
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:8888';
        return '';
    }

    async function call(path, body, token) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        let response;
        try {
            response = await fetch(apiBase() + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
        } catch (err) {
            const offline = new Error("Couldn't reach Speech Count. Check your connection and try again.");
            offline.offline = true;
            throw offline;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const err = new Error(data.error || 'Something went wrong');
            err.status = response.status;
            throw err;
        }
        return data;
    }

    function requestCode(email) {
        return call('/api/auth-code', { email });
    }

    async function verifyCode(email, code) {
        const data = await call('/api/auth-verify', { email, code });
        const session = { userId: data.userId, email: data.email, token: data.token, signedInAt: new Date().toISOString() };
        store.session.set(session);
        store.syncState.set(null);
        try {
            await billing.logIn(session.userId);
        } catch (err) {
            // Billing can be refreshed later; the sign-in itself succeeded.
        }
        billing.track('sign_in', { platform: billing.platform() });
        if (window.SpeechSync) window.SpeechSync.start();
        return session;
    }

    async function signOut({ removeLocal } = {}) {
        if (window.SpeechSync) window.SpeechSync.stop();
        store.session.clear();
        store.syncState.set(null);
        if (removeLocal) store.clearRoster();
        try {
            await billing.logOut();
        } catch (err) {
            // Cached entitlement stays until the next refresh.
        }
    }

    function session() {
        return store.session.get();
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // Two-step inline form: email -> code. Resolves with the session once
    // signed in; the caller decides what happens next.
    function mountForm(container, { title, onSignedIn, onCancel } = {}) {
        container.textContent = '';
        const form = el('form', 'signin-form');
        form.noValidate = true;
        if (title) form.appendChild(el('p', 'signin-title', title));

        const emailField = el('input', 'signin-input');
        emailField.type = 'email';
        emailField.name = 'email';
        emailField.placeholder = 'you@school.org';
        emailField.autocomplete = 'email';
        emailField.required = true;

        const codeField = el('input', 'signin-input');
        codeField.type = 'text';
        codeField.name = 'code';
        codeField.inputMode = 'numeric';
        codeField.pattern = '[0-9]*';
        codeField.autocomplete = 'one-time-code';
        codeField.placeholder = '6-digit code';
        codeField.maxLength = 6;
        codeField.hidden = true;

        const submit = el('button', 'add-btn signin-submit', 'Send code');
        submit.type = 'submit';
        const cancel = el('button', 'btn btn-ghost', 'Cancel');
        cancel.type = 'button';
        cancel.hidden = !onCancel;
        const status = el('p', 'signin-status');
        status.setAttribute('aria-live', 'polite');

        const row = el('div', 'signin-row');
        row.append(emailField, codeField, submit, cancel);
        form.append(row, status);
        container.appendChild(form);

        let step = 'email';
        let busy = false;

        function setBusy(value) {
            busy = value;
            submit.disabled = value;
            emailField.disabled = value || step === 'code';
            codeField.disabled = value;
        }

        cancel.addEventListener('click', () => onCancel && onCancel());

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
            try {
                if (step === 'email') {
                    await requestCode(email);
                    step = 'code';
                    codeField.hidden = false;
                    submit.textContent = 'Sign in';
                    status.textContent = 'We emailed a code to ' + email + '. It expires in 10 minutes.';
                    setBusy(false);
                    codeField.focus();
                    return;
                }
                const session = await verifyCode(email, codeField.value);
                status.textContent = 'Signed in as ' + session.email + '.';
                if (onSignedIn) onSignedIn(session);
            } catch (err) {
                status.textContent = err.message;
                setBusy(false);
                if (step === 'code') codeField.focus();
            }
        });

        emailField.focus();
        return form;
    }

    window.SpeechAccount = {
        apiBase,
        call,
        requestCode,
        verifyCode,
        signOut,
        session,
        mountForm,
    };
})();
