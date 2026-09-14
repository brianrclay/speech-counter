(() => {
    'use strict';

    const store = window.SpeechStore;

    const listView = document.getElementById('list-view');
    const detailView = document.getElementById('detail-view');
    const searchInput = document.getElementById('student-search');
    const studentList = document.getElementById('student-list');
    const emptyState = document.getElementById('empty-state');
    const noMatches = document.getElementById('no-matches');
    const studentName = document.getElementById('student-name');
    const renameBtn = document.getElementById('rename');
    const deleteStudentBtn = document.getElementById('delete-student');
    const sessionList = document.getElementById('session-list');
    const noSessions = document.getElementById('no-sessions');
    const statSessions = document.getElementById('stat-sessions');
    const statTrials = document.getElementById('stat-trials');
    const statPercent = document.getElementById('stat-percent');
    const exportBtn = document.getElementById('export');
    const importFile = document.getElementById('import-file');
    const template = document.querySelector('.row.template');

    const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const shortDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

    let currentId = null;

    function percentOf(correct, incorrect) {
        const total = correct + incorrect;
        return total === 0 ? 0 : Math.ceil((correct / total) * 100);
    }

    function plural(count, word) {
        return count + ' ' + word + (count === 1 ? '' : 's');
    }

    function renderList() {
        const key = store.nameKey(searchInput.value);
        const students = store.students.list()
            .filter((s) => !key || s.nameKey.includes(key))
            .map((student) => {
                const summary = store.sessions.summary(student.id);
                return { student, summary, changedAt: summary.lastAt || student.updatedAt };
            })
            .sort((a, b) => (a.changedAt > b.changedAt ? -1 : a.changedAt < b.changedAt ? 1 : 0));

        studentList.textContent = '';
        students.forEach(({ student, summary }) => {
            const card = document.createElement('a');
            card.className = 'student-card';
            card.href = '#student/' + student.id;

            const name = document.createElement('span');
            name.className = 'student-card-name';
            name.textContent = student.name;

            const meta = document.createElement('span');
            meta.className = 'student-card-meta';
            meta.textContent = summary.count === 0
                ? 'No sessions yet'
                : plural(summary.count, 'session') + ' · Last ' + shortDayFormat.format(new Date(summary.lastAt));

            const percent = document.createElement('span');
            percent.className = 'student-card-percent';
            percent.textContent = summary.trials === 0 ? '–' : summary.percent + '%';

            card.append(name, meta, percent);
            studentList.appendChild(card);
        });

        const total = store.students.list().length;
        emptyState.hidden = total !== 0;
        noMatches.hidden = total === 0 || students.length !== 0;
    }

    function buildSessionRow(session) {
        const row = template.cloneNode(true);
        row.classList.remove('template');
        row.dataset.sessionId = session.id;
        row.querySelector('.session-time').textContent = timeFormat.format(new Date(session.startedAt));
        row.querySelector('.session-target').textContent = session.target || 'No target';
        row.querySelector('.session-correct').textContent = session.correct;
        row.querySelector('.session-incorrect').textContent = session.incorrect;
        row.querySelector('.session-correct').setAttribute('aria-label', session.correct + ' correct');
        row.querySelector('.session-incorrect').setAttribute('aria-label', session.incorrect + ' incorrect');

        const percent = document.createElement('span');
        percent.className = 'session-percent';
        percent.textContent = percentOf(session.correct, session.incorrect) + '% correct';
        row.querySelector('.session-target').after(percent);
        return row;
    }

    function renderDetail(id) {
        const student = store.students.get(id);
        if (!student) {
            location.hash = '';
            return;
        }
        currentId = id;
        studentName.textContent = student.name;
        document.title = student.name + ' - Speech Count';

        const sessions = store.sessions.forStudent(id);
        const summary = store.sessions.summary(id);
        statSessions.textContent = summary.count;
        statTrials.textContent = summary.trials;
        statPercent.textContent = summary.percent + '%';

        sessionList.textContent = '';
        let lastDay = null;
        sessions.forEach((session) => {
            const day = dayFormat.format(new Date(session.startedAt));
            if (day !== lastDay) {
                const heading = document.createElement('h3');
                heading.className = 'day-heading';
                heading.textContent = day;
                sessionList.appendChild(heading);
                lastDay = day;
            }
            sessionList.appendChild(buildSessionRow(session));
        });
        noSessions.hidden = sessions.length !== 0;
    }

    function route() {
        const match = location.hash.match(/^#student\/([\w-]+)$/);
        if (match) {
            listView.hidden = true;
            detailView.hidden = false;
            renderDetail(match[1]);
        } else {
            currentId = null;
            detailView.hidden = true;
            listView.hidden = false;
            document.title = 'Students - Speech Count';
            renderList();
        }
        window.scrollTo(0, 0);
    }

    searchInput.addEventListener('input', renderList);

    renameBtn.addEventListener('click', () => {
        const student = store.students.get(currentId);
        if (!student) return;
        const name = prompt('Rename student', student.name);
        if (name === null) return;
        const clash = store.students.findByName(name);
        if (clash && clash.id !== student.id) {
            alert('There is already a student named ' + clash.name + '.');
            return;
        }
        store.students.rename(student.id, name);
        renderDetail(student.id);
    });

    deleteStudentBtn.addEventListener('click', () => {
        const student = store.students.get(currentId);
        if (!student) return;
        const summary = store.sessions.summary(student.id);
        const detail = summary.count === 0 ? '' : ' and their ' + plural(summary.count, 'session');
        if (!confirm('Delete ' + student.name + detail + '? This cannot be undone.')) return;
        store.students.remove(student.id);
        location.hash = '';
    });

    // Inline editing swaps the target text and the two count chips for
    // inputs in place, so the row keeps its shape while being edited.
    function startEdit(row) {
        const editing = sessionList.querySelector('.row.editing');
        if (editing && editing !== row) renderDetail(currentId);
        const session = store.sessions.get(row.dataset.sessionId);
        if (!session || row.classList.contains('editing')) return;

        row.classList.add('editing');
        const editBtn = row.querySelector('.edit-session');
        editBtn.querySelector('span').textContent = 'Save';
        editBtn.setAttribute('aria-label', 'Save session');

        const target = document.createElement('input');
        target.type = 'text';
        target.className = 'session-target-input';
        target.placeholder = 'Target';
        target.value = session.target;
        row.querySelector('.session-target').replaceChildren(target);

        [['correct', session.correct], ['incorrect', session.incorrect]].forEach(([kind, value]) => {
            const input = document.createElement('input');
            input.type = 'number';
            input.inputMode = 'numeric';
            input.min = '0';
            input.step = '1';
            input.className = 'session-count-input';
            input.setAttribute('aria-label', kind === 'correct' ? 'Correct count' : 'Incorrect count');
            input.value = value;
            row.querySelector('.session-' + kind).replaceChildren(input);
        });

        target.focus();
        target.select();
    }

    function saveEdit(row) {
        const id = row.dataset.sessionId;
        const count = (input) => Math.max(0, Math.floor(Number(input.value)) || 0);
        const fields = {
            target: row.querySelector('.session-target-input').value,
            correct: count(row.querySelector('.session-correct input')),
            incorrect: count(row.querySelector('.session-incorrect input')),
        };
        store.sessions.update(id, fields);

        // If this session is still open on the board, keep the board's copy
        // in step so the next tap doesn't overwrite the edit.
        const board = store.board.load();
        if (Array.isArray(board)) {
            const boardRow = board.find((r) => r.sessionId === id);
            if (boardRow) {
                Object.assign(boardRow, fields);
                store.board.save(board);
            }
        }
        renderDetail(currentId);
    }

    sessionList.addEventListener('click', (event) => {
        const row = event.target.closest('.row');
        if (!row) return;

        if (event.target.closest('.edit-session')) {
            if (row.classList.contains('editing')) saveEdit(row);
            else startEdit(row);
            return;
        }

        if (event.target.closest('.cancel-edit')) {
            renderDetail(currentId);
            return;
        }

        if (event.target.closest('.delete-row')) {
            if (!confirm('Remove this session?')) return;
            store.sessions.remove(row.dataset.sessionId);
            renderDetail(currentId);
        }
    });

    sessionList.addEventListener('keydown', (event) => {
        const row = event.target.closest('.row.editing');
        if (!row) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            saveEdit(row);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            renderDetail(currentId);
        }
    });

    async function exportBackup() {
        const json = store.exportJSON();
        const filename = 'speech-count-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        const capacitor = window.Capacitor;
        const share = capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()
            && capacitor.Plugins && capacitor.Plugins.Share;

        if (share) {
            try {
                await share.share({ title: filename, text: json });
            } catch (err) {
                // User dismissed the share sheet.
            }
            return;
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    exportBtn.addEventListener('click', exportBackup);

    importFile.addEventListener('change', async () => {
        const file = importFile.files[0];
        importFile.value = '';
        if (!file) return;
        try {
            const changed = store.importJSON(await file.text());
            alert(changed === 0 ? 'Nothing new to import.' : 'Imported ' + plural(changed, 'record') + '.');
            route();
        } catch (err) {
            alert('Could not import that file: ' + err.message);
        }
    });

    window.addEventListener('hashchange', route);

    store.ready().then(route);
})();
