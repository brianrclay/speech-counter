(() => {
    'use strict';

    const rowWrapper = document.getElementById('row-wrapper');
    const template = document.querySelector('.row.template');
    const undoBtn = document.getElementById('undo');
    const clearBtn = document.getElementById('clear');
    const addRowBtn = document.getElementById('add-row');

    const store = window.SpeechStore;

    const MAX_HISTORY = 100;
    const history = [];

    function reducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function playEnter(row) {
        if (reducedMotion()) return;
        row.classList.add('row-enter');
        row.addEventListener('animationend', () => row.classList.remove('row-enter'), { once: true });
    }

    function playExitThenRemove(row, onDone) {
        if (row.classList.contains('row-exit')) return;

        if (reducedMotion()) {
            row.remove();
            onDone();
            return;
        }

        row.style.maxHeight = row.offsetHeight + 'px';
        row.style.overflow = 'hidden';
        // Force a reflow so the browser registers the starting height
        // before the row-exit class animates it down to 0.
        row.offsetHeight;
        row.classList.add('row-exit');

        // transitionend fires once per animated property, and they don't all
        // finish at once (opacity is shorter than max-height) - key off
        // max-height specifically and ignore the rest instead of using
        // { once: true }, which would consume the listener on whichever
        // property happens to finish first.
        function onTransitionEnd(event) {
            if (event.propertyName !== 'max-height') return;
            row.removeEventListener('transitionend', onTransitionEnd);
            row.remove();
            onDone();
        }
        row.addEventListener('transitionend', onTransitionEnd);
    }

    const hapticTap = window.SpeechSwipe.haptic;

    function pop(el) {
        if (reducedMotion()) return;
        el.classList.remove('pop');
        el.offsetHeight;
        el.classList.add('pop');
        el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true });
    }

    function pushHistory(action) {
        history.push(action);
        if (history.length > MAX_HISTORY) history.shift();
        undoBtn.disabled = false;
    }

    function getRowCounts(row) {
        const correct = parseInt(row.querySelector('.ticker.correct').textContent, 10) || 0;
        const incorrect = parseInt(row.querySelector('.ticker.incorrect').textContent, 10) || 0;
        return { correct, incorrect };
    }

    function renderRow(row, correct, incorrect) {
        const total = correct + incorrect;
        const percent = total === 0 ? 0 : Math.ceil((correct / total) * 100);
        row.querySelector('.ticker.correct').textContent = correct;
        row.querySelector('.ticker.correct').setAttribute('aria-label', correct + ' correct');
        row.querySelector('.ticker.incorrect').textContent = incorrect;
        row.querySelector('.ticker.incorrect').setAttribute('aria-label', incorrect + ' incorrect');
        row.querySelector('.totalCount').textContent = total;
        row.querySelector('.percentValue').textContent = percent + '%';
    }

    function nameInput(row) {
        return row.querySelector('.name-fields input:first-child');
    }

    function targetInput(row) {
        return row.querySelector('.name-fields input:last-child');
    }

    function cloneTemplateRow(sessionId) {
        const row = template.cloneNode(true);
        row.classList.remove('template');
        row.dataset.sessionId = sessionId || store.uuid();
        const name = nameInput(row);
        name.setAttribute('role', 'combobox');
        name.setAttribute('aria-autocomplete', 'list');
        name.setAttribute('aria-expanded', 'false');
        name.setAttribute('aria-controls', 'name-suggestions');
        name.autocomplete = 'off';
        return row;
    }

    function serializeRows() {
        return Array.from(rowWrapper.querySelectorAll('.row:not(.template)')).map((row) => {
            const { correct, incorrect } = getRowCounts(row);
            return {
                sessionId: row.dataset.sessionId,
                name: nameInput(row).value,
                target: targetInput(row).value,
                correct,
                incorrect,
            };
        });
    }

    function saveState() {
        store.board.save(serializeRows());
    }

    function buildRowFromData(data) {
        const row = cloneTemplateRow(data.sessionId);
        nameInput(row).value = data.name || '';
        targetInput(row).value = data.target || '';
        renderRow(row, data.correct || 0, data.incorrect || 0);
        return row;
    }

    function loadState() {
        const saved = store.board.load();
        rowWrapper.querySelectorAll('.row:not(.template)').forEach((row) => row.remove());
        // Only fall back to a blank row when nothing has ever been saved -
        // an empty array is a legitimate saved state (the user deleted
        // every row) and should be restored as empty.
        if (!Array.isArray(saved)) {
            rowWrapper.appendChild(cloneTemplateRow());
            return;
        }
        saved.forEach((data) => rowWrapper.appendChild(buildRowFromData(data)));
    }

    // A row is a session. It's recorded under a student only while it has a
    // name and at least one trial; otherwise any earlier record is retired
    // (undo back to 0/0, or the name being cleared).
    function syncSession(row) {
        if (!store.entitlements.isPremium()) return;
        const id = row.dataset.sessionId;
        const student = store.students.findByName(nameInput(row).value);
        const { correct, incorrect } = getRowCounts(row);
        if (!student || correct + incorrect === 0) {
            store.sessions.remove(id);
            return;
        }
        store.sessions.upsert({
            id,
            studentId: student.id,
            target: targetInput(row).value,
            correct,
            incorrect,
        });
    }

    // Students are created on commit (blur, Enter, picking a suggestion, or
    // the first tap), never per keystroke - otherwise typing "Brian" would
    // leave "B", "Br", "Bri"... in the roster.
    function commitName(row) {
        const input = nameInput(row);
        const { correct, incorrect } = getRowCounts(row);
        if (store.entitlements.isPremium() && correct + incorrect > 0) {
            const student = store.students.findOrCreate(input.value);
            if (student) input.value = student.name;
        }
        syncSession(row);
        saveState();
    }

    function tick(row, kind, tickBtn) {
        const { correct, incorrect } = getRowCounts(row);
        if (kind === 'correct') {
            renderRow(row, correct + 1, incorrect);
        } else {
            renderRow(row, correct, incorrect + 1);
        }
        pop(tickBtn);
        hapticTap();
        pushHistory({ type: 'tick', row, kind });
        commitName(row);
    }

    function deleteRow(row) {
        const nextSibling = row.nextElementSibling;
        playExitThenRemove(row, () => {
            pushHistory({ type: 'deleteRow', row, nextSibling });
            saveState();
        });
    }

    function reinsertRow(row, nextSibling) {
        row.style.maxHeight = '';
        row.style.overflow = '';
        row.classList.remove('row-exit');
        swipe.reset(row);

        if (nextSibling && nextSibling.parentNode === rowWrapper) {
            rowWrapper.insertBefore(row, nextSibling);
        } else {
            rowWrapper.appendChild(row);
        }
        playEnter(row);
    }

    function undo() {
        const action = history.pop();
        if (!action) return;

        switch (action.type) {
            case 'tick': {
                const { correct, incorrect } = getRowCounts(action.row);
                if (action.kind === 'correct') {
                    renderRow(action.row, correct - 1, incorrect);
                } else {
                    renderRow(action.row, correct, incorrect - 1);
                }
                syncSession(action.row);
                break;
            }
            case 'addRow': {
                playExitThenRemove(action.row, () => saveState());
                break;
            }
            case 'deleteRow': {
                reinsertRow(action.row, action.nextSibling);
                break;
            }
            case 'clear': {
                Array.from(rowWrapper.querySelectorAll('.row:not(.template)')).forEach((row) => row.remove());
                action.rows.forEach((row) => {
                    row.style.maxHeight = '';
                    row.style.overflow = '';
                    row.classList.remove('row-exit');
                    swipe.reset(row);
                    rowWrapper.appendChild(row);
                    playEnter(row);
                });
                break;
            }
        }

        undoBtn.disabled = history.length === 0;
        saveState();
    }

    const swipe = window.SpeechSwipe.attach({
        container: rowWrapper,
        item: '.row',
        body: '.row-body',
        action: '.row-swipe-action',
        isDisabled: (row) => row.classList.contains('row-exit'),
        onRemove: deleteRow,
    });

    rowWrapper.addEventListener('click', (event) => {
        const tickBtn = event.target.closest('.ticker');
        if (tickBtn) {
            const kind = tickBtn.classList.contains('correct') ? 'correct' : 'incorrect';
            tick(tickBtn.closest('.row'), kind, tickBtn);
            return;
        }

        const deleteBtn = event.target.closest('.delete-row');
        if (deleteBtn) {
            deleteRow(deleteBtn.closest('.row'));
        }
    });

    rowWrapper.addEventListener('input', (event) => {
        if (!event.target.matches('.name-fields input')) return;
        const row = event.target.closest('.row');
        if (event.target === nameInput(row)) {
            suggestions.update(event.target);
        } else {
            syncSession(row);
        }
        saveState();
    });

    rowWrapper.addEventListener('change', (event) => {
        if (event.target.matches('.name-fields input')) {
            commitName(event.target.closest('.row'));
        }
    });

    // Searchable roster dropdown under whichever Name field is focused. One
    // shared popover on <body> (.row clips overflow for its exit animation),
    // placed with position: absolute in document coordinates rather than
    // fixed: the iOS keyboard shifts the viewport, which drags a fixed
    // element away from its input, whereas a page-anchored one scrolls with
    // the row.
    const suggestions = (() => {
        const list = document.createElement('div');
        list.id = 'name-suggestions';
        list.className = 'name-suggestions';
        list.setAttribute('role', 'listbox');
        list.hidden = true;
        document.body.appendChild(list);

        let input = null;
        let items = [];
        let active = -1;
        let closeTimer = null;

        function position() {
            if (!input) return;
            const rect = input.getBoundingClientRect();
            list.style.left = rect.left + window.scrollX + 'px';
            list.style.top = rect.bottom + 4 + window.scrollY + 'px';
            list.style.minWidth = rect.width + 'px';
        }

        // With the keyboard up, iOS scrolls the input into the visible area
        // but not necessarily the space below it; nudge the page so the
        // list shows too.
        function reveal() {
            if (list.hidden) return;
            list.scrollIntoView({ block: 'nearest' });
        }

        function matches(query) {
            const key = store.nameKey(query);
            return store.students.list()
                .map((student) => ({ student, lastAt: store.sessions.summary(student.id).lastAt || student.updatedAt }))
                .filter(({ student }) => !key || student.nameKey.includes(key))
                .sort((a, b) => (a.lastAt > b.lastAt ? -1 : a.lastAt < b.lastAt ? 1 : a.student.name.localeCompare(b.student.name)))
                .map(({ student }) => student);
        }

        function setActive(index) {
            active = index;
            Array.from(list.children).forEach((el, i) => {
                el.classList.toggle('active', i === active);
                el.setAttribute('aria-selected', i === active ? 'true' : 'false');
            });
            input.setAttribute('aria-activedescendant', active >= 0 ? list.children[active].id : '');
            if (active >= 0) list.children[active].scrollIntoView({ block: 'nearest' });
        }

        function close() {
            clearTimeout(closeTimer);
            if (!input) return;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            list.hidden = true;
            list.textContent = '';
            input = null;
            items = [];
            active = -1;
        }

        function update(target) {
            if (!store.entitlements.isPremium()) return;
            clearTimeout(closeTimer);
            input = target;
            items = matches(input.value);
            if (items.length === 0) {
                list.hidden = true;
                list.textContent = '';
                input.setAttribute('aria-expanded', 'false');
                return;
            }
            list.textContent = '';
            items.forEach((student, i) => {
                const option = document.createElement('div');
                option.className = 'name-suggestion';
                option.id = 'name-suggestion-' + i;
                option.setAttribute('role', 'option');
                option.textContent = student.name;
                list.appendChild(option);
            });
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            setActive(-1);
            position();
        }

        function choose(index) {
            if (!input || index < 0 || index >= items.length) return;
            const row = input.closest('.row');
            input.value = items[index].name;
            close();
            commitName(row);
        }

        // Keep the input focused while an option is tapped so the list isn't
        // torn down before the click lands; selection itself waits for the
        // click so a swipe to scroll the list doesn't pick a name.
        list.addEventListener('pointerdown', (event) => event.preventDefault());
        list.addEventListener('click', (event) => {
            const option = event.target.closest('.name-suggestion');
            if (option) choose(Array.from(list.children).indexOf(option));
        });

        rowWrapper.addEventListener('focusin', (event) => {
            if (!event.target.matches('.name-fields input:first-child')) return;
            update(event.target);
            // Give the keyboard a moment to open and settle the scroll.
            setTimeout(reveal, 350);
        });

        rowWrapper.addEventListener('focusout', (event) => {
            if (event.target !== input) return;
            clearTimeout(closeTimer);
            closeTimer = setTimeout(close, 150);
        });

        rowWrapper.addEventListener('keydown', (event) => {
            if (event.target !== input || list.hidden) return;
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    setActive((active + 1) % items.length);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    setActive((active - 1 + items.length) % items.length);
                    break;
                case 'Enter':
                    if (active >= 0) {
                        event.preventDefault();
                        choose(active);
                    }
                    break;
                case 'Escape':
                    event.preventDefault();
                    close();
                    break;
            }
        });

        window.addEventListener('resize', position);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                position();
                reveal();
            });
        }

        return { update };
    })();

    addRowBtn.addEventListener('click', () => {
        const row = cloneTemplateRow();
        rowWrapper.appendChild(row);
        playEnter(row);
        pushHistory({ type: 'addRow', row });
        saveState();
    });

    clearBtn.addEventListener('click', () => {
        const rows = Array.from(rowWrapper.querySelectorAll('.row:not(.template)'));
        if (rows.length === 0) return;

        let remaining = rows.length;
        rows.forEach((row) => {
            playExitThenRemove(row, () => {
                remaining -= 1;
                if (remaining === 0) {
                    const freshRow = cloneTemplateRow();
                    rowWrapper.appendChild(freshRow);
                    playEnter(freshRow);
                    pushHistory({ type: 'clear', rows });
                    saveState();
                }
            });
        });
    });

    undoBtn.addEventListener('click', undo);

    store.ready().then(loadState).then(() => window.SpeechBilling.refreshIfPremium());

    document.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undo();
        }
    });
})();
