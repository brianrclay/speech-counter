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
    };

    const SAVE_DELAY = 150;

    const cache = { board: null, students: [], sessions: [] };
    const saveTimers = {};
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
        readyPromise = Promise.all([read(KEYS.board), read(KEYS.students), read(KEYS.sessions)])
            .then(([board, students, sessions]) => {
                cache.board = parse(board, null);
                cache.students = parse(students, []);
                cache.sessions = parse(sessions, []);
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

    const entitlements = {
        isPremium() {
            return true;
        },
    };

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

    // One row per session, plus a bare row for any student with no sessions
    // so they survive a round trip. The trailing ID columns are what make
    // re-importing an exported file idempotent.
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

    function parseCSV(text) {
        const rows = [];
        let row = [];
        let cell = '';
        let quoted = false;
        const src = text.replace(/^﻿/, '');
        for (let i = 0; i < src.length; i += 1) {
            const ch = src[i];
            if (quoted) {
                if (ch === '"') {
                    if (src[i + 1] === '"') {
                        cell += '"';
                        i += 1;
                    } else {
                        quoted = false;
                    }
                } else {
                    cell += ch;
                }
            } else if (ch === '"') {
                quoted = true;
            } else if (ch === ',') {
                row.push(cell);
                cell = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && src[i + 1] === '\n') i += 1;
                row.push(cell);
                rows.push(row);
                row = [];
                cell = '';
            } else {
                cell += ch;
            }
        }
        if (cell !== '' || row.length > 0) {
            row.push(cell);
            rows.push(row);
        }
        return rows.filter((r) => r.some((c) => c.trim() !== ''));
    }

    const CSV_HEADER_ALIASES = {
        student: 'student', name: 'student', studentname: 'student',
        target: 'target',
        correct: 'correct',
        incorrect: 'incorrect',
        date: 'date', startedat: 'date', started: 'date',
        updated: 'updated', updatedat: 'updated',
        sessionid: 'sessionId', id: 'sessionId',
        studentid: 'studentId',
    };

    function isoOrNull(value) {
        const text = String(value || '').trim();
        if (!text) return null;
        const date = new Date(text);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    function countOrZero(value) {
        const n = parseInt(String(value || '').trim(), 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    }

    // Merges by id, keeping whichever copy was updated most recently, so an
    // older backup never clobbers newer work on this device.
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

    function importJSON(text) {
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.students) || !Array.isArray(data.sessions)) {
            throw new Error('Not a Speech Count backup');
        }
        const changed = mergeRecords(cache.students, data.students) + mergeRecords(cache.sessions, data.sessions);
        persist('students');
        persist('sessions');
        return changed;
    }

    // Students are matched by ID, then by name, and never overwritten - a
    // spreadsheet is a poor source of truth for a rename. Sessions merge
    // the same way JSON backups do; rows without a Session ID (typed into
    // a spreadsheet by hand) are added as new sessions.
    function importCSV(text) {
        const rows = parseCSV(text);
        if (rows.length === 0) throw new Error('The file is empty');
        const header = rows[0].map((h) => CSV_HEADER_ALIASES[h.trim().toLowerCase().replace(/[^a-z]/g, '')] || null);
        if (!header.includes('student')) throw new Error('Missing a Student column');

        let changed = 0;
        const incomingSessions = [];
        rows.slice(1).forEach((cells) => {
            const row = {};
            header.forEach((key, i) => {
                if (key) row[key] = cells[i] || '';
            });
            const name = cleanName(row.student);
            if (!name) return;

            const id = String(row.studentId || '').trim();
            let student = (id && students.get(id)) || students.findByName(name);
            if (!student) {
                const stamp = now();
                student = { id: id || uuid(), name, nameKey: nameKey(name), createdAt: stamp, updatedAt: stamp, deletedAt: null };
                cache.students.push(student);
                changed += 1;
            }

            const target = cleanName(row.target);
            if (!target && !String(row.correct || '').trim() && !String(row.incorrect || '').trim()) return;

            const startedAt = isoOrNull(row.date) || now();
            incomingSessions.push({
                id: String(row.sessionId || '').trim() || uuid(),
                studentId: student.id,
                target,
                correct: countOrZero(row.correct),
                incorrect: countOrZero(row.incorrect),
                startedAt,
                createdAt: startedAt,
                updatedAt: isoOrNull(row.updated) || startedAt,
                deletedAt: null,
            });
        });

        changed += mergeRecords(cache.sessions, incomingSessions);
        persist('students');
        persist('sessions');
        return changed;
    }

    function importText(text) {
        const body = String(text || '').replace(/^﻿/, '').trimStart();
        return body.startsWith('{') ? importJSON(body) : importCSV(body);
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
        exportJSON,
        exportCSV,
        importJSON,
        importCSV,
        importText,
    };
})();
