// Shared data layer for the board (index.html) and the Students page.
//
// Records carry a UUID, createdAt/updatedAt, and a deletedAt tombstone so
// cloud sync can merge last-write-wins and propagate deletes without
// changing the shape of anything stored on the device.
//
// Roster data (students, sessions, the board, and sync bookkeeping) lives in
// a workspace: one for the device when signed out, and one per account
// after sign-in. Switching accounts swaps workspaces, so nothing entered
// under one account can be uploaded to another.
//
// Everything is loaded into memory once by ready(); after that every read is
// synchronous and every write is debounced out to the adapter.
(() => {
    'use strict';

    const GLOBAL_KEYS = {
        entitlement: 'speech-counter:entitlement:v1',
        session: 'speech-counter:session:v1',
    };

    // The signed-out workspace keeps the original key names so existing
    // installs carry their board and roster forward untouched.
    const WORKSPACE_KEYS = {
        board: 'speech-counter-state-v1',
        students: 'speech-counter:students:v1',
        sessions: 'speech-counter:sessions:v1',
        sync: 'speech-counter:sync:v1',
        pending: 'speech-counter:pending:v1',
    };

    const SAVE_DELAY = 150;
    const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

    const cache = { board: null, students: [], sessions: [], sync: null, pending: null, entitlement: null, session: null };
    const saveTimers = {};
    const persistListeners = [];
    let readyPromise = null;
    let workspace = null;
    let storageFailed = false;

    function workspaceKey(name, ws) {
        const base = WORKSPACE_KEYS[name];
        return ws === null ? base : base + ':' + ws;
    }

    function keyFor(name) {
        return GLOBAL_KEYS[name] || workspaceKey(name, workspace);
    }

    function nativePreferences() {
        const capacitor = window.Capacitor;
        if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()
            && capacitor.Plugins && capacitor.Plugins.Preferences) {
            return capacitor.Plugins.Preferences;
        }
        return null;
    }

    function localRead(key) {
        try {
            return localStorage.getItem(key);
        } catch (err) {
            return null;
        }
    }

    function localRemove(key) {
        try {
            localStorage.removeItem(key);
        } catch (err) {
            // Nothing to remove, or storage unavailable.
        }
    }

    function reportStorageError() {
        if (storageFailed) return;
        storageFailed = true;
        window.dispatchEvent(new CustomEvent('speech:storage-error'));
    }

    async function read(key) {
        const prefs = nativePreferences();
        if (!prefs) return localRead(key);

        const { value } = await prefs.get({ key });
        if (value !== null && value !== undefined) return value;

        // First launch after the Preferences adapter shipped: carry the
        // board/roster over from the WebView's localStorage, then drop the
        // old copy so clearing the device later clears everything.
        const legacy = localRead(key);
        if (legacy !== null) {
            await prefs.set({ key, value: legacy });
            localRemove(key);
        }
        return legacy;
    }

    function write(key, value) {
        const prefs = nativePreferences();
        if (prefs) {
            return prefs.set({ key, value }).then(() => { storageFailed = false; }, reportStorageError);
        }
        try {
            localStorage.setItem(key, value);
            storageFailed = false;
        } catch (err) {
            reportStorageError();
        }
        return Promise.resolve();
    }

    function remove(key) {
        localRemove(key);
        const prefs = nativePreferences();
        return prefs ? prefs.remove({ key }).catch(() => {}) : Promise.resolve();
    }

    function parse(raw, fallback) {
        try {
            const value = JSON.parse(raw);
            return value === null || value === undefined ? fallback : value;
        } catch (err) {
            return fallback;
        }
    }

    function persist(name) {
        clearTimeout(saveTimers[name]);
        const key = keyFor(name);
        saveTimers[name] = setTimeout(() => {
            saveTimers[name] = null;
            write(key, JSON.stringify(cache[name]));
        }, SAVE_DELAY);
        persistListeners.forEach((cb) => cb(name));
    }

    function onPersist(cb) {
        persistListeners.push(cb);
    }

    function flush() {
        const writes = [];
        Object.keys(saveTimers).forEach((name) => {
            if (!saveTimers[name]) return;
            clearTimeout(saveTimers[name]);
            saveTimers[name] = null;
            writes.push(write(keyFor(name), JSON.stringify(cache[name])));
        });
        return Promise.all(writes);
    }

    // Deleted records keep their id and timestamps so the deletion still
    // propagates, but nothing identifying; after the tombstone horizon the
    // record is dropped entirely.
    function blank(record) {
        if ('name' in record) {
            record.name = '';
            record.nameKey = '';
        }
        if ('target' in record) {
            record.target = '';
            record.correct = 0;
            record.incorrect = 0;
        }
    }

    function compact(list) {
        const cutoff = Date.now() - TOMBSTONE_TTL_MS;
        return list.filter((r) => {
            if (!r.deletedAt) return true;
            blank(r);
            return new Date(r.deletedAt).getTime() > cutoff;
        });
    }

    function asList(raw) {
        const value = parse(raw, []);
        return Array.isArray(value) ? value : [];
    }

    async function loadWorkspace(ws) {
        const [board, students, sessions, sync, pending] = await Promise.all(
            ['board', 'students', 'sessions', 'sync', 'pending'].map((name) => read(workspaceKey(name, ws))),
        );
        workspace = ws;
        cache.board = parse(board, null);
        cache.students = compact(asList(students));
        cache.sessions = compact(asList(sessions));
        cache.sync = parse(sync, null);
        cache.pending = parse(pending, null) || { students: {}, sessions: {} };
    }

    function ready() {
        if (readyPromise) return readyPromise;
        readyPromise = Promise.all([read(GLOBAL_KEYS.entitlement), read(GLOBAL_KEYS.session)])
            .then(async ([entitlement, session]) => {
                cache.entitlement = parse(entitlement, null);
                cache.session = parse(session, null);
                await loadWorkspace(cache.session && cache.session.userId ? cache.session.userId : null);

                if (!nativePreferences() && navigator.storage && navigator.storage.persist) {
                    navigator.storage.persist().catch(() => {});
                }
            });
        return readyPromise;
    }

    // Called when the signed-in account changes. Pending writes for the old
    // workspace go out first so nothing is lost or written under the wrong key.
    async function switchWorkspace(ws) {
        if (ws === workspace) return;
        await flush();
        await loadWorkspace(ws);
        window.dispatchEvent(new CustomEvent('speech:changed'));
    }

    function uuid() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    }

    function now() {
        return new Date().toISOString();
    }

    function nameKey(name) {
        return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function cleanName(name) {
        return String(name || '').trim().replace(/\s+/g, ' ');
    }

    const live = (record) => !record.deletedAt;

    // Local edits are remembered by id until sync has pushed them, so a
    // device clock that jumps can't hide a change from the upload.
    function markDirty(kind, record) {
        cache.pending[kind][record.id] = record.updatedAt;
        persist('pending');
    }

    const students = {
        list() {
            return cache.students.filter(live);
        },
        get(id) {
            return cache.students.find((s) => s.id === id && live(s)) || null;
        },
        findByName(name) {
            const key = nameKey(name);
            if (!key) return null;
            return cache.students.find((s) => s.nameKey === key && live(s)) || null;
        },
        findOrCreate(name) {
            const existing = students.findByName(name);
            if (existing) return existing;
            const display = cleanName(name);
            if (!display) return null;
            const stamp = now();
            const student = {
                id: uuid(),
                name: display,
                nameKey: nameKey(display),
                createdAt: stamp,
                updatedAt: stamp,
                deletedAt: null,
            };
            cache.students.push(student);
            window.SpeechAnalytics?.track('student_create');
            persist('students');
            markDirty('students', student);
            return student;
        },
        rename(id, name) {
            const student = students.get(id);
            const display = cleanName(name);
            if (!student || !display) return student;
            window.SpeechAnalytics?.track('student_rename');
            student.name = display;
            student.nameKey = nameKey(display);
            student.updatedAt = now();
            persist('students');
            markDirty('students', student);
            return student;
        },
        remove(id) {
            const student = students.get(id);
            if (!student) return;
            const stamp = now();
            window.SpeechAnalytics?.track('student_delete');
            student.deletedAt = stamp;
            student.updatedAt = stamp;
            blank(student);
            markDirty('students', student);
            cache.sessions.forEach((session) => {
                if (session.studentId === id && live(session)) {
                    session.deletedAt = stamp;
                    session.updatedAt = stamp;
                    blank(session);
                    markDirty('sessions', session);
                }
            });
            persist('students');
            persist('sessions');
        },
    };

    const sessions = {
        get(id) {
            return cache.sessions.find((s) => s.id === id && live(s)) || null;
        },
        upsert({ id, studentId, target, correct, incorrect }) {
            const stamp = now();
            let session = cache.sessions.find((s) => s.id === id);
            if (!session) {
                session = { id, startedAt: stamp, createdAt: stamp };
                cache.sessions.push(session);
                window.SpeechAnalytics?.track('session_save');
            }
            session.studentId = studentId;
            session.target = cleanName(target);
            session.correct = correct;
            session.incorrect = incorrect;
            session.updatedAt = stamp;
            session.deletedAt = null;
            persist('sessions');
            markDirty('sessions', session);
            return session;
        },
        update(id, { target, correct, incorrect }) {
            const session = sessions.get(id);
            if (!session) return null;
            session.target = cleanName(target);
            session.correct = correct;
            session.incorrect = incorrect;
            session.updatedAt = now();
            persist('sessions');
            markDirty('sessions', session);
            return session;
        },
        remove(id) {
            const session = sessions.get(id);
            if (!session) return;
            const stamp = now();
            session.deletedAt = stamp;
            session.updatedAt = stamp;
            blank(session);
            persist('sessions');
            markDirty('sessions', session);
        },
        forStudent(studentId) {
            return cache.sessions
                .filter((s) => s.studentId === studentId && live(s))
                .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
        },
        summary(studentId) {
            return sessions.summaryMap().get(studentId) || { count: 0, trials: 0, correct: 0, percent: 0, lastAt: null };
        },
        // One pass over every session, so listing N students costs O(sessions)
        // rather than N scans.
        summaryMap() {
            const map = new Map();
            cache.sessions.forEach((s) => {
                if (!live(s)) return;
                let entry = map.get(s.studentId);
                if (!entry) {
                    entry = { count: 0, trials: 0, correct: 0, percent: 0, lastAt: null };
                    map.set(s.studentId, entry);
                }
                entry.count += 1;
                entry.correct += s.correct;
                entry.trials += s.correct + s.incorrect;
                if (!entry.lastAt || s.updatedAt > entry.lastAt) entry.lastAt = s.updatedAt;
            });
            map.forEach((entry) => {
                entry.percent = entry.trials === 0 ? 0 : Math.ceil((entry.correct / entry.trials) * 100);
            });
            return map;
        },
    };

    const board = {
        load() {
            return cache.board;
        },
        save(rows) {
            cache.board = rows;
            persist('board');
        },
    };

    // Last known answer from the billing provider, kept on-device so the
    // roster keeps working offline. billing.js refreshes it at boot and after
    // every purchase, restore, and sign-in.
    const entitlements = {
        isPremium() {
            const e = cache.entitlement;
            if (!e || !e.active) return false;
            return !e.expiresAt || e.expiresAt > now();
        },
        get() {
            return cache.entitlement;
        },
        set(value) {
            cache.entitlement = value ? Object.assign({ checkedAt: now() }, value) : null;
            persist('entitlement');
            window.dispatchEvent(new CustomEvent('speech:entitlement'));
        },
    };

    // Setting a session with a different userId swaps the workspace; the
    // promise resolves once the new one is loaded.
    const session = {
        get() {
            return cache.session;
        },
        async set(value) {
            cache.session = value || null;
            persist('session');
            await switchWorkspace(cache.session && cache.session.userId ? cache.session.userId : null);
            window.dispatchEvent(new CustomEvent('speech:session'));
        },
        clear() {
            return session.set(null);
        },
    };

    const syncState = {
        get() {
            return cache.sync;
        },
        set(value) {
            cache.sync = value || null;
            persist('sync');
        },
    };

    // What sync still has to upload: every record marked dirty since its
    // last successful push.
    function pendingChanges() {
        const pick = (kind, list) => {
            const ids = cache.pending[kind];
            return list.filter((r) => Object.prototype.hasOwnProperty.call(ids, r.id));
        };
        return {
            students: pick('students', cache.students),
            sessions: pick('sessions', cache.sessions),
        };
    }

    // Called after a push succeeds with the records as they were sent; a
    // record edited again while the push was in flight stays pending.
    function clearPending(sent) {
        ['students', 'sessions'].forEach((kind) => {
            (sent[kind] || []).forEach((record) => {
                if (cache.pending[kind][record.id] === record.updatedAt) delete cache.pending[kind][record.id];
            });
        });
        persist('pending');
    }

    function hasPending() {
        return Object.keys(cache.pending.students).length + Object.keys(cache.pending.sessions).length > 0;
    }

    // Records arriving from another device via sync. Same last-write-wins
    // merge by id, then anything on screen re-renders.
    function applyRemote({ students: incomingStudents, sessions: incomingSessions }) {
        const changed = mergeRecords(cache.students, incomingStudents || [])
            + mergeRecords(cache.sessions, incomingSessions || []);
        if (changed > 0) {
            persist('students');
            persist('sessions');
            window.dispatchEvent(new CustomEvent('speech:changed'));
        }
        return changed;
    }

    // The signed-out workspace's records, for offering to bring them into an
    // account on sign-in.
    async function localWorkspaceCounts() {
        if (workspace === null) return { students: students.list().length };
        return { students: asList(await read(workspaceKey('students', null))).filter(live).length };
    }

    // Moves the signed-out workspace into the current account workspace (an
    // explicit choice on sign-in), then empties the signed-out one.
    async function importLocalWorkspace() {
        if (workspace === null) return 0;
        const [studentsRaw, sessionsRaw, boardRaw] = await Promise.all(
            ['students', 'sessions', 'board'].map((name) => read(workspaceKey(name, null))),
        );
        const localStudents = compact(asList(studentsRaw));
        const localSessions = compact(asList(sessionsRaw));
        const changed = mergeRecords(cache.students, localStudents) + mergeRecords(cache.sessions, localSessions);
        localStudents.forEach((r) => markDirty('students', r));
        localSessions.forEach((r) => markDirty('sessions', r));
        if (!cache.board && boardRaw) cache.board = parse(boardRaw, null);
        persist('students');
        persist('sessions');
        persist('board');
        await Promise.all(['students', 'sessions', 'board', 'sync', 'pending'].map((name) => remove(workspaceKey(name, null))));
        window.dispatchEvent(new CustomEvent('speech:changed'));
        return changed;
    }

    // Erases the current workspace from this device: roster, board, and sync
    // bookkeeping, from memory and from every storage copy.
    async function clearWorkspace() {
        cache.students = [];
        cache.sessions = [];
        cache.board = null;
        cache.sync = null;
        cache.pending = { students: {}, sessions: {} };
        ['students', 'sessions', 'board', 'sync', 'pending'].forEach((name) => {
            clearTimeout(saveTimers[name]);
            saveTimers[name] = null;
        });
        await Promise.all(['students', 'sessions', 'board', 'sync', 'pending'].map((name) => remove(keyFor(name))));
        window.dispatchEvent(new CustomEvent('speech:changed'));
    }

    function exportJSON() {
        return JSON.stringify({
            app: 'speech-counter',
            version: 1,
            exportedAt: now(),
            students: cache.students.filter(live),
            sessions: cache.sessions.filter(live),
        }, null, 2);
    }

    const CSV_COLUMNS = ['Student', 'Target', 'Correct', 'Incorrect', 'Total', 'Percent', 'Date', 'Updated', 'Session ID', 'Student ID'];

    // Quote as CSV needs, and defuse text a spreadsheet would run as a
    // formula (a name typed as "=1+1" stays visible text, not a calculation).
    function csvCell(value) {
        let text = value === null || value === undefined ? '' : String(value);
        if (/^[\s\x00-\x1f]*[=+\-@]/.test(text)) text = "'" + text;
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    // One row per session, plus a bare row for any student with no sessions.
    // The trailing ID columns let a spreadsheet be matched back to the app's
    // records if that's ever needed.
    function exportCSV() {
        const rows = [CSV_COLUMNS];
        students.list().forEach((student) => {
            const list = sessions.forStudent(student.id);
            if (list.length === 0) {
                rows.push([student.name, '', '', '', '', '', '', '', '', student.id]);
                return;
            }
            list.forEach((s) => {
                const total = s.correct + s.incorrect;
                const percent = total === 0 ? 0 : Math.ceil((s.correct / total) * 100);
                rows.push([student.name, s.target, s.correct, s.incorrect, total, percent,
                    s.startedAt, s.updatedAt, s.id, student.id]);
            });
        });
        return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // Merges by id, keeping whichever copy was updated most recently, so an
    // older copy from another device never clobbers newer work on this one.
    function mergeRecords(into, incoming) {
        const index = new Map(into.map((r, i) => [r.id, i]));
        let changed = 0;
        incoming.forEach((record) => {
            if (!record || typeof record.id !== 'string') return;
            const at = index.get(record.id);
            if (at === undefined) {
                index.set(record.id, into.length);
                into.push(record);
                changed += 1;
            } else if ((record.updatedAt || '') > (into[at].updatedAt || '')) {
                into[at] = record;
                changed += 1;
            }
        });
        return changed;
    }

    window.addEventListener('pagehide', flush);

    window.SpeechStore = {
        ready,
        flush,
        uuid,
        nameKey,
        students,
        sessions,
        board,
        entitlements,
        session,
        syncState,
        onPersist,
        pendingChanges,
        clearPending,
        hasPending,
        applyRemote,
        localWorkspaceCounts,
        importLocalWorkspace,
        clearWorkspace,
        mergeRecords,
        exportJSON,
        exportCSV,
        storageFailed: () => storageFailed,
        workspace: () => workspace,
    };
})();
