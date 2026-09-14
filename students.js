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
    const addStudentBtn = document.getElementById('add-student');
    const addStudentForm = document.getElementById('add-student-form');
    const newStudentName = document.getElementById('new-student-name');
    const cancelAddStudent = document.getElementById('cancel-add-student');
    const listToolbar = document.querySelector('.list-toolbar');
    const bulkToolbar = document.getElementById('bulk-toolbar');
    const bulkSelectAll = document.getElementById('bulk-select-all');
    const bulkCount = document.getElementById('bulk-count');
    const bulkDelete = document.getElementById('bulk-delete');
    const bulkDone = document.getElementById('bulk-done');
    const swipeActionTemplate = document.getElementById('student-swipe-action').content.firstElementChild;

    const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const shortDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

    let currentId = null;
    let selecting = false;
    const selected = new Set();

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
            const item = document.createElement('div');
            item.className = 'student-item';
            item.dataset.id = student.id;
            item.appendChild(swipeActionTemplate.cloneNode(true));

            const card = document.createElement('a');
            card.className = 'student-card';
            card.href = '#student/' + student.id;
            card.dataset.id = student.id;
            card.draggable = false;

            const check = document.createElement('span');
            check.className = 'student-check';
            check.setAttribute('aria-hidden', 'true');

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

            card.append(check, name, meta, percent);
            item.appendChild(card);
            studentList.appendChild(item);
        });

        const total = store.students.list().length;
        emptyState.hidden = total !== 0;
        noMatches.hidden = total === 0 || students.length !== 0;
        applySelection();
    }

    // Long-pressing a student enters selection mode for bulk deletion;
    // tapping cards then toggles them instead of opening them. Selection
    // changes update the existing cards in place so the card under the
    // user's finger survives the transition.
    function applySelection() {
        studentList.classList.toggle('selecting', selecting);
        studentList.querySelectorAll('.student-card').forEach((card) => {
            const isSelected = selecting && selected.has(card.dataset.id);
            card.classList.toggle('selected', isSelected);
            card.parentElement.classList.toggle('selected', isSelected);
            if (selecting) {
                card.setAttribute('role', 'checkbox');
                card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            } else {
                card.removeAttribute('role');
                card.removeAttribute('aria-checked');
            }
        });
        renderBulkToolbar();
    }

    function renderBulkToolbar() {
        bulkToolbar.hidden = !selecting;
        listToolbar.hidden = selecting;
        if (!selecting) return;
        const total = store.students.list().length;
        bulkCount.textContent = selected.size + ' selected';
        bulkSelectAll.textContent = selected.size === total && total > 0 ? 'Deselect all' : 'Select all';
        bulkDelete.disabled = selected.size === 0;
        bulkDelete.textContent = selected.size === 0 ? 'Delete' : 'Delete (' + selected.size + ')';
    }

    function enterSelectMode(id) {
        selecting = true;
        selected.clear();
        if (id) selected.add(id);
        showAddStudent(false);
        applySelection();
    }

    function exitSelectMode() {
        selecting = false;
        selected.clear();
        renderList();
    }

    function toggleSelected(id) {
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        applySelection();
    }

    const LONG_PRESS_MS = 500;
    let press = null;
    let suppressCardClick = false;

    function cancelPress() {
        if (!press) return;
        clearTimeout(press.timer);
        press = null;
    }

    studentList.addEventListener('pointerdown', (event) => {
        const card = event.target.closest('.student-card');
        if (!card || event.button !== 0) return;
        cancelPress();
        suppressCardClick = false;
        press = {
            id: card.dataset.id,
            x: event.clientX,
            y: event.clientY,
            timer: setTimeout(() => {
                press = null;
                suppressCardClick = true;
                if (selecting) toggleSelected(card.dataset.id);
                else enterSelectMode(card.dataset.id);
            }, LONG_PRESS_MS),
        };
    });

    studentList.addEventListener('pointermove', (event) => {
        if (!press) return;
        if (Math.abs(event.clientX - press.x) > 10 || Math.abs(event.clientY - press.y) > 10) cancelPress();
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
        studentList.addEventListener(type, cancelPress);
    });

    // iOS shows a link preview / callout on long-press of an <a>.
    studentList.addEventListener('contextmenu', (event) => {
        if (event.target.closest('.student-card')) event.preventDefault();
    });

    studentList.addEventListener('click', (event) => {
        const card = event.target.closest('.student-card');
        if (!card) return;
        if (suppressCardClick) {
            suppressCardClick = false;
            event.preventDefault();
            return;
        }
        if (!selecting) return;
        event.preventDefault();
        toggleSelected(card.dataset.id);
    });

    // Swiping a card left works like the board rows, but deleting a student
    // is permanent, so a committed swipe asks first and slides back if the
    // user declines.
    const cardSwipe = window.SpeechSwipe.attach({
        container: studentList,
        item: '.student-item',
        body: '.student-card',
        action: '.row-swipe-action',
        isDisabled: () => selecting,
        onRemove: (item) => {
            const student = store.students.get(item.dataset.id);
            if (!student) return;
            const summary = store.sessions.summary(student.id);
            const detail = summary.count === 0 ? '' : ' and their ' + plural(summary.count, 'session');
            if (!confirm('Delete ' + student.name + detail + '? This cannot be undone.')) {
                cardSwipe.reset(item);
                return;
            }
            store.students.remove(student.id);
            renderList();
        },
    });

    bulkSelectAll.addEventListener('click', () => {
        const all = store.students.list();
        if (selected.size === all.length) selected.clear();
        else all.forEach((s) => selected.add(s.id));
        applySelection();
    });

    bulkDone.addEventListener('click', exitSelectMode);

    bulkDelete.addEventListener('click', () => {
        const ids = Array.from(selected).filter((id) => store.students.get(id));
        if (ids.length === 0) return;
        const sessionCount = ids.reduce((sum, id) => sum + store.sessions.summary(id).count, 0);
        const who = ids.length === 1 ? store.students.get(ids[0]).name : plural(ids.length, 'student');
        const detail = sessionCount === 0 ? '' : ' and their ' + plural(sessionCount, 'session');
        if (!confirm('Delete ' + who + detail + '? This cannot be undone.')) return;
        ids.forEach((id) => store.students.remove(id));
        exitSelectMode();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && selecting && !listView.hidden) exitSelectMode();
    });

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
            selecting = false;
            selected.clear();
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

    function showAddStudent(show) {
        addStudentForm.hidden = !show;
        addStudentBtn.hidden = show;
        if (show) {
            newStudentName.value = '';
            newStudentName.focus();
        }
    }

    addStudentBtn.addEventListener('click', () => showAddStudent(true));
    cancelAddStudent.addEventListener('click', () => showAddStudent(false));

    newStudentName.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            showAddStudent(false);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            addStudent();
        }
    });

    addStudentForm.addEventListener('submit', (event) => {
        event.preventDefault();
        addStudent();
    });

    function addStudent() {
        const name = newStudentName.value.trim();
        if (!name) {
            newStudentName.focus();
            return;
        }
        const existing = store.students.findByName(name);
        store.students.findOrCreate(name);
        showAddStudent(false);
        searchInput.value = '';
        renderList();
        if (existing) alert(existing.name + ' is already in your roster.');
    }

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
