(() => {
    'use strict';
    // Shared by the real Students screen and the isolated sample workspace.
    const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    const detailMarkup = `            <a href="#" class="back-link">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>All students</span>
            </a>
            <div class="student-heading">
                <h2 id="student-name" class="student-name"></h2>
                <button type="button" id="rename" class="btn btn-sm">Rename</button>
            </div>
            <div class="summary">
                <div class="stat">
                    <span class="stat-value" id="stat-sessions">0</span>
                    <span class="stat-label">Sessions</span>
                </div>
                <div class="stat">
                    <span class="stat-value" id="stat-trials">0</span>
                    <span class="stat-label">Trials</span>
                </div>
                <div class="stat">
                    <span class="stat-value" id="stat-percent">0%</span>
                    <span class="stat-label">Correct</span>
                </div>
            </div>
            <div id="session-list" class="session-list"></div>
            <p id="no-sessions" class="empty-state" hidden>No sessions recorded for this student yet.</p>
            <button type="button" id="delete-student" class="delete-student">Delete student</button>`;
    const rowTemplate = document.createElement('template');
    rowTemplate.innerHTML = `        <div class="row">
            <div class="row-body">
                <div class="row-info">
                    <span class="session-time"></span>
                    <span class="session-target"></span>
                </div>
                <span class="session-count session-correct"></span>
                <span class="session-count session-incorrect"></span>
                <div class="session-actions">
                        <button type="button" class="edit-session" aria-label="Edit session">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                            <span>Edit</span>
                        </button>
                        <button type="button" class="cancel-edit">Cancel</button>
                        <button type="button" class="delete-row" aria-label="Remove session">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                            <span>Remove</span>
                        </button>
                </div>
            </div>
        </div>`;

    function mount(container) {
        container.innerHTML = detailMarkup;
    }
    function percentOf(correct, incorrect) {
        const total = correct + incorrect;
        return total === 0 ? 0 : Math.ceil((correct / total) * 100);
    }
    function buildSessionRow(session) {
        const row = rowTemplate.content.firstElementChild.cloneNode(true);
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
    function renderSessions(container, sessions) {
        container.replaceChildren();
        let lastDay = null;
        sessions.forEach((session) => {
            const day = dayFormat.format(new Date(session.startedAt));
            if (day !== lastDay) {
                const heading = document.createElement('h3');
                heading.className = 'day-heading';
                heading.textContent = day;
                container.appendChild(heading);
                lastDay = day;
            }
            container.appendChild(buildSessionRow(session));
        });
    }
    function startEdit(row, session) {
        if (!session || row.classList.contains('editing')) return;
        row.classList.add('editing');
        const editBtn = row.querySelector('.edit-session');
        editBtn.querySelector('span').textContent = 'Save';
        editBtn.setAttribute('aria-label', 'Save session');

        const target = document.createElement('input');
        target.type = 'text';
        target.className = 'session-target-input';
        target.placeholder = 'Target';
        target.setAttribute('aria-label', 'Target');
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


    function editFields(row) {
        const count = (input) => Math.max(0, Math.floor(Number(input.value)) || 0);
        const fields = {
            target: row.querySelector('.session-target-input').value,
            correct: count(row.querySelector('.session-correct input')),
            incorrect: count(row.querySelector('.session-incorrect input')),
        };
        return fields;
    }
    window.SpeechHistory = { mount, renderSessions, startEdit, editFields };
})();
