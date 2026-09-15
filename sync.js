// Keeps the roster in step with the copy in the cloud once the user has
// signed in. Local storage stays the source of truth: every sync pushes what
// changed here and merges what changed elsewhere with the same last-write-
// wins rule an import uses. Runs only while signed in and premium.
(() => {
    'use strict';

    const store = window.SpeechStore;
    const account = window.SpeechAccount;

    const PUSH_DELAY = 2000;
    const RETRY_DELAY = 30000;

    let running = false;
    let inFlight = false;
    let pending = false;
    let applying = false;
    let timer = null;
    let status = 'off';
    let lastError = null;

    function setStatus(next, err) {
        status = next;
        lastError = err || null;
        window.dispatchEvent(new CustomEvent('speech:sync', { detail: { status, error: lastError } }));
    }

    function schedule(delay) {
        if (!running) return;
        clearTimeout(timer);
        timer = setTimeout(run, delay);
    }

    function eligible() {
        return Boolean(store.session.get()) && store.entitlements.isPremium();
    }

    async function run() {
        if (!running) return;
        if (inFlight) {
            pending = true;
            return;
        }
        if (!eligible()) {
            stop();
            return;
        }
        inFlight = true;
        setStatus('syncing');
        const session = store.session.get();
        const state = store.syncState.get() || { cursor: '', pushedAt: '' };
        const pushedAt = new Date().toISOString();
        const changes = store.changedSince(state.pushedAt);
        try {
            const data = await account.call('/api/sync', {
                since: state.cursor,
                students: changes.students,
                sessions: changes.sessions,
            }, session.token);
            applying = true;
            try {
                store.applyRemote(data);
            } finally {
                applying = false;
            }
            store.syncState.set({ cursor: data.now, pushedAt, syncedAt: data.now });
            setStatus('idle');
        } catch (err) {
            if (err.status === 401) {
                account.signOut();
                setStatus('signed-out', err);
            } else if (err.status === 402) {
                window.SpeechBilling.refresh().catch(() => {});
                setStatus('error', err);
                schedule(RETRY_DELAY);
            } else {
                setStatus('error', err);
                schedule(RETRY_DELAY);
            }
        } finally {
            inFlight = false;
            if (pending) {
                pending = false;
                schedule(500);
            }
        }
    }

    function onPersist(name) {
        if (applying || !running) return;
        if (name === 'students' || name === 'sessions') schedule(PUSH_DELAY);
    }

    function onVisible() {
        if (document.visibilityState === 'visible') schedule(0);
    }

    function onOnline() {
        schedule(0);
    }

    function start() {
        if (running) {
            schedule(0);
            return;
        }
        if (!eligible()) return;
        running = true;
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onOnline);
        setStatus('idle');
        schedule(0);
    }

    function stop() {
        running = false;
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        setStatus('off');
    }

    store.onPersist(onPersist);
    window.addEventListener('speech:entitlement', () => {
        if (eligible()) start();
        else if (running) stop();
    });
    // Last-chance push when the page is closed mid-debounce. The cursor isn't
    // advanced, so the next launch simply pushes the same records again.
    window.addEventListener('pagehide', () => {
        if (running && !inFlight) {
            const state = store.syncState.get() || { cursor: '', pushedAt: '' };
            const changes = store.changedSince(state.pushedAt);
            if (changes.students.length + changes.sessions.length === 0) return;
            const session = store.session.get();
            if (!session) return;
            fetch(account.apiBase() + '/api/sync', {
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
                body: JSON.stringify({ since: state.cursor, students: changes.students, sessions: changes.sessions }),
            }).catch(() => {});
        }
    });

    store.ready().then(() => {
        if (eligible()) start();
    });

    window.SpeechSync = {
        start,
        stop,
        now: () => schedule(0),
        status: () => ({ status, error: lastError, state: store.syncState.get() }),
    };
})();
