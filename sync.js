// Keeps the roster in step with the copy in the cloud once the user has
// signed in. Local storage stays the source of truth: every sync pushes the
// records edited here since the last push (tracked by id, not by clock) and
// merges what changed elsewhere with the same last-write-wins rule. Runs
// only while signed in and premium.
//
// Every run belongs to a generation. stop() advances the generation and
// aborts the request, so a response that arrives after sign-out, account
// switch, or deletion is dropped instead of applied to whatever workspace
// is loaded by then.
(() => {
    'use strict';

    const store = window.SpeechStore;
    const account = window.SpeechAccount;

    const PUSH_DELAY = 2000;
    const RETRY_BASE = 15000;
    const RETRY_MAX = 5 * 60 * 1000;
    const CHUNK = 1000;
    const KEEPALIVE_BYTES = 60 * 1024;

    let running = false;
    let inFlight = false;
    let pending = false;
    let applying = false;
    let timer = null;
    let status = 'off';
    let lastError = null;
    let generation = 0;
    let controller = null;
    let failures = 0;
    let current = null;

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

    function retryDelay() {
        const backoff = Math.min(RETRY_MAX, RETRY_BASE * 2 ** Math.min(failures, 5));
        return backoff / 2 + Math.random() * backoff / 2;
    }

    function eligible() {
        return Boolean(store.session.get()) && store.entitlements.isPremium();
    }

    // Every await in a round re-checks that the round's generation is still
    // current; stop() bumps it, so a late response is thrown away before it
    // can touch the store.
    async function post(body, token, signal, gen) {
        const data = await account.call('/api/sync', body, token, { signal });
        if (gen !== generation) {
            const stale = new Error('stale sync');
            stale.name = 'AbortError';
            throw stale;
        }
        return data;
    }

    // One round: push pending records (in chunks), then pull pages of changes
    // after the cursor until the server says there are no more.
    async function exchange(session, signal, gen) {
        const state = () => store.syncState.get() || { cursor: 0 };
        const changes = store.pendingChanges();
        const queue = [];
        for (let i = 0; i < changes.students.length; i += CHUNK) queue.push({ students: changes.students.slice(i, i + CHUNK), sessions: [] });
        for (let i = 0; i < changes.sessions.length; i += CHUNK) queue.push({ students: [], sessions: changes.sessions.slice(i, i + CHUNK) });
        if (queue.length === 0) queue.push({ students: [], sessions: [] });

        for (const chunk of queue) {
            const data = await post({ since: state().cursor || 0, ...chunk }, session.token, signal, gen);
            apply(data);
            store.clearPending(chunk);
            store.syncState.set({ cursor: data.rev, syncedAt: new Date().toISOString() });
            let more = data.more;
            while (more) {
                const page = await post({ since: state().cursor || 0 }, session.token, signal, gen);
                apply(page);
                store.syncState.set({ cursor: page.rev, syncedAt: new Date().toISOString() });
                more = page.more;
            }
        }
    }

    function apply(data) {
        applying = true;
        try {
            store.applyRemote(data);
        } finally {
            applying = false;
        }
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
        const gen = generation;
        controller = new AbortController();
        setStatus('syncing');
        const session = store.session.get();
        let finish;
        current = new Promise((resolve) => { finish = resolve; });
        try {
            await exchange(session, controller.signal, gen);
            if (gen !== generation) return;
            failures = 0;
            setStatus('idle');
        } catch (err) {
            if (gen !== generation || (err && err.name === 'AbortError')) return;
            failures += 1;
            if (err.status === 401) {
                account.signOut();
                setStatus('signed-out', err);
            } else if (err.status === 413) {
                // Too much for one sync; retrying the same payload won't help.
                setStatus('error', err);
            } else {
                if (err.status === 402) window.SpeechBilling.refresh().catch(() => {});
                setStatus('error', err);
                schedule(retryDelay());
            }
        } finally {
            if (gen === generation) {
                inFlight = false;
                controller = null;
                if (pending) {
                    pending = false;
                    schedule(500);
                }
            }
            finish();
        }
    }

    // Push whatever is pending right now and wait for the round to finish;
    // used before logging out so nothing unsynced is thrown away.
    async function flush() {
        if (!eligible()) return;
        clearTimeout(timer);
        if (inFlight) {
            await current;
            if (store.hasPending()) await run();
            return;
        }
        await run();
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
        failures = 0;
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onOnline);
        setStatus('idle');
        schedule(0);
    }

    function stop() {
        running = false;
        generation += 1;
        inFlight = false;
        pending = false;
        if (controller) controller.abort();
        controller = null;
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
    // Last-chance push when the page is closed mid-debounce. Pending ids
    // aren't cleared, so the next launch simply pushes the same records again
    // (the server merge is idempotent). Large payloads exceed what keepalive
    // allows and wait for the next launch instead.
    window.addEventListener('pagehide', () => {
        if (!running || inFlight) return;
        const changes = store.pendingChanges();
        if (changes.students.length + changes.sessions.length === 0) return;
        const session = store.session.get();
        if (!session) return;
        const state = store.syncState.get() || { cursor: 0 };
        const body = JSON.stringify({ since: state.cursor || 0, students: changes.students, sessions: changes.sessions });
        if (body.length > KEEPALIVE_BYTES) return;
        fetch(account.apiBase() + '/api/sync', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token },
            body,
        }).catch(() => {});
    });

    store.ready().then(() => {
        if (eligible()) start();
    });

    window.SpeechSync = {
        start,
        stop,
        flush,
        now: () => schedule(0),
        status: () => ({ status, error: lastError, state: store.syncState.get() }),
    };
})();
