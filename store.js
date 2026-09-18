// Shared data layer for the board (index.html) and the Students page.
//
// Records carry a UUID, createdAt/updatedAt, and a deletedAt tombstone so a
// future cloud sync can merge last-write-wins and propagate deletes without
// changing the shape of anything stored on the device.
//
// Everything is loaded into memory once by ready(); after that every read is
// synchronous and every write is debounced out to the adapter.
(() => {
    'use strict';

    const KEYS = {
        board: 'speech-counter-state-v1',
        students: 'speech-counter:students:v1',
        sessions: 'speech-counter:sessions:v1',
        entitlement: 'speech-counter:entitlement:v1',
        session: 'speech-counter:session:v1',
        sync: 'speech-counter:sync:v1',
    };

    const SAVE_DELAY = 150;

    const cache = { board: null, students: [], sessions: [], entitlement: null, session: null, sync: null };
    const saveTimers = {};
    const persistListeners = [];
    let readyPromise = null;

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

    function localWrite(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) {
            // Storage can be unavailable (private browsing, full, disabled) - not fatal.
        }
    }

    async function read(key) {
        const prefs = nativePreferences();
        if (!prefs) return localRead(key);

        const { value } = await prefs.get({ key });
        if (value !== null && value !== undefined) return value;

        // First launch after the Preferences adapter shipped: carry the
        // board/roster over from the WebView's localStorage.
        const legacy = localRead(key);
        if (legacy !== null) await prefs.set({ key, value: legacy });
        return legacy;
    }

    function write(key, value) {
        const prefs = nativePreferences();
        if (prefs) {
            prefs.set({ key, value }).catch(() => {});
        } else {
            localWrite(key, value);
        }
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
        saveTimers[name] = setTimeout(() => {
            write(KEYS[name], JSON.stringify(cache[name]));
        }, SAVE_DELAY);
        persistListeners.forEach((cb) => cb(name));
    }

    function onPersist(cb) {
        persistListeners.push(cb);
    }

    function flush() {
        Object.keys(saveTimers).forEach((name) => {
            if (!saveTimers[name]) return;
            clearTimeout(saveTimers[name]);
            saveTimers[name] = null;
            write(KEYS[name], JSON.stringify(cache[name]));
        });
    }

    function ready() {
        if (readyPromise) return readyPromise;
        readyPromise = Promise.all([
            read(KEYS.board), read(KEYS.students), read(KEYS.sessions),
            read(KEYS.entitlement), read(KEYS.session), read(KEYS.sync),
        ])
            .then(([board, students, sessions, entitlement, session, sync]) => {
                cache.board = parse(board, null);
                cache.students = parse(students, []);
                cache.sessions = parse(sessions, []);
                cache.entitlement = parse(entitlement, null);
                cache.session = parse(session, null);
                cache.sync = parse(sync, null);
                if (!Array.isArray(cache.students)) cache.students = [];
                if (!Array.isArray(cache.sessions)) cache.sessions = [];

                if (!nativePreferences() && navigator.storage && navigator.storage.persist) {
                    navigator.storage.persist().catch(() => {});
                }
            });
        return readyPromise;
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
            persist('students');
            return student;
        },
        rename(id, name) {
            const student = students.get(id);
            const display = cleanName(name);
            if (!student || !display) return student;
            student.name = display;
            student.nameKey = nameKey(display);
            student.updatedAt = now();
            persist('students');
            return student;
        },
        remove(id) {
            const student = students.get(id);
            if (!student) return;
            const stamp = now();
            student.deletedAt = stamp;
            student.updatedAt = stamp;
            cache.sessions.forEach((session) => {
                if (session.studentId === id && live(session)) {
                    session.deletedAt = stamp;
                    session.updatedAt = stamp;
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
            }
            session.studentId = studentId;
            session.target = cleanName(target);
            session.correct = correct;
            session.incorrect = incorrect;
            session.updatedAt = stamp;
            session.deletedAt = null;
            persist('sessions');
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
            return session;
        },
        remove(id) {
            const session = sessions.get(id);
            if (!session) return;
            const stamp = now();
            session.deletedAt = stamp;
            session.updatedAt = stamp;
            persist('sessions');
        },
        forStudent(studentId) {
            return cache.sessions
                .filter((s) => s.studentId === studentId && live(s))
                .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
        },
        summary(studentId) {
            const list = sessions.forStudent(studentId);
            let correct = 0;
            let trials = 0;
            let lastAt = null;
            list.forEach((s) => {
                correct += s.correct;
                trials += s.correct + s.incorrect;
                if (!lastAt || s.updatedAt > lastAt) lastAt = s.updatedAt;
            });
            const percent = trials === 0 ? 0 : Math.ceil((correct / trials) * 100);
            return { count: list.length, trials, correct, percent, lastAt };
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

    const session = {
        get() {
            return cache.session;
        },
        set(value) {
            cache.session = value || null;
            persist('session');
            window.dispatchEvent(new CustomEvent('speech:session'));
        },
        clear() {
            session.set(null);
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

    function changedSince(since) {
        const after = (r) => !since || (r.updatedAt || '') > since;
        return {
            students: cache.students.filter(after),
            sessions: cache.sessions.filter(after),
        };
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

    function clearRoster() {
        cache.students = [];
        cache.sessions = [];
        persist('students');
        persist('sessions');
        window.dispatchEvent(new CustomEvent('speech:changed'));
    }

    function exportJSON() {
        return JSON.stringify({
            app: 'speech-counter',
            version: 1,
            exportedAt: now(),
            students: cache.students,
            sessions: cache.sessions,
        }, null, 2);
    }

    const CSV_COLUMNS = ['Student', 'Target', 'Correct', 'Incorrect', 'Total', 'Percent', 'Date', 'Updated', 'Session ID', 'Student ID'];

    function csvCell(value) {
        const text = value === null || value === undefined ? '' : String(value);
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
        let changed = 0;
        incoming.forEach((record) => {
            if (!record || typeof record.id !== 'string') return;
            const index = into.findIndex((r) => r.id === record.id);
            if (index === -1) {
                into.push(record);
                changed += 1;
            } else if ((record.updatedAt || '') > (into[index].updatedAt || '')) {
                into[index] = record;
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
        changedSince,
        applyRemote,
        clearRoster,
        mergeRecords,
        exportJSON,
        exportCSV,
    };
})();
