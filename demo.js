(() => {
    'use strict';
    // Sample records live only in memory. This page never loads SpeechStore,
    // account, billing, or sync, so edits cannot change a user's workspace.
    const historyUI = window.SpeechHistory;
    const detail = document.getElementById('detail-view');
    historyUI.mount(detail);
    detail.querySelector('.back-link').remove();
    const list = document.getElementById('session-list');
    const preview = document.getElementById('demo-csv');
    const button = document.getElementById('demo-export');
    const studentId = 'sample-maya';
    let student;
    let sessions;
    function reset() {
        student = { id: studentId, name: 'Maya' };
        sessions = [18, 16, 14].map((correct, index) => ({
            id: 'sample-session-' + index,
            studentId,
            target: 'Initial /s/ sentences',
            correct,
            incorrect: 20 - correct,
            startedAt: new Date(2026, 8, 22 - index * 7, 10, 30).toISOString(),
            updatedAt: new Date(2026, 8, 22 - index * 7, 10, 35).toISOString(),
        }));
        render();
    }
    function csvCell(value) {
        let text = value === null || value === undefined ? '' : String(value);
        if (/^[\s\x00-\x1f]*[=+\-@]/.test(text)) text = "'" + text;
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }
    function render() {
        detail.hidden = !student;
        document.getElementById('demo-deleted').hidden = Boolean(student);
        const correct = sessions.reduce((sum, session) => sum + session.correct, 0);
        const trials = sessions.reduce((sum, session) => sum + session.correct + session.incorrect, 0);
        document.getElementById('student-name').textContent = student?.name || '';
        document.getElementById('stat-sessions').textContent = sessions.length;
        document.getElementById('stat-trials').textContent = trials;
        document.getElementById('stat-percent').textContent = (trials ? Math.ceil(correct / trials * 100) : 0) + '%';
        historyUI.renderSessions(list, sessions);
        document.getElementById('no-sessions').hidden = sessions.length !== 0;
        // Match the real app's CSV columns and escaping.
        const rows = [['Student', 'Target', 'Correct', 'Incorrect', 'Total', 'Percent', 'Date', 'Updated', 'Session ID', 'Student ID']];
        sessions.forEach(session => {
            const total = session.correct + session.incorrect;
            rows.push([student.name, session.target, session.correct, session.incorrect, total,
                total ? Math.ceil(session.correct / total * 100) : 0, session.startedAt, session.updatedAt, session.id, student.id]);
        });
        if (student && !sessions.length) rows.push([student.name, '', '', '', '', '', '', '', '', student.id]);
        preview.textContent = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    }
    function save(row) {
        const session = sessions.find(item => item.id === row.dataset.sessionId);
        if (!session) return;
        Object.assign(session, historyUI.editFields(row), { updatedAt: new Date().toISOString() });
        render();
    }
    list.addEventListener('click', event => {
        let row = event.target.closest('.row');
        if (!row) return;
        const id = row.dataset.sessionId;
        if (event.target.closest('.edit-session')) {
            if (row.classList.contains('editing')) save(row);
            else {
                render();
                row = [...list.querySelectorAll('.row')].find(item => item.dataset.sessionId === id);
                historyUI.startEdit(row, sessions.find(item => item.id === id));
            }
        } else if (event.target.closest('.cancel-edit')) render();
        else if (event.target.closest('.delete-row') && confirm('Remove this sample session?')) {
            sessions = sessions.filter(item => item.id !== id);
            render();
        }
    });
    list.addEventListener('keydown', event => {
        const row = event.target.closest('.row.editing');
        if (!row) return;
        if (event.key === 'Enter') { event.preventDefault(); save(row); }
        else if (event.key === 'Escape') { event.preventDefault(); render(); }
    });
    document.getElementById('rename').addEventListener('click', () => {
        const name = prompt('Rename sample student', student.name);
        if (name === null || !name.trim()) return;
        student.name = name.trim().slice(0, 80);
        render();
    });
    document.getElementById('delete-student').addEventListener('click', () => {
        if (!confirm('Delete this sample student and their sessions?')) return;
        student = null;
        sessions = [];
        render();
    });
    document.getElementById('demo-reset').addEventListener('click', reset);
    button.addEventListener('click', () => {
        preview.hidden = !preview.hidden;
        button.setAttribute('aria-expanded', String(!preview.hidden));
        button.textContent = preview.hidden ? 'Preview sample CSV' : 'Hide sample CSV';
        if (!preview.hidden) {
            window.SpeechAnalytics?.track('demo_export');
            preview.focus();
        }
    });
    document.querySelector('.demo-cta').addEventListener('click', () => window.SpeechAnalytics?.track('demo_cta_click'));
    window.SpeechAnalytics?.track('demo_view');
    reset();
})();
