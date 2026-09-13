(() => {
    'use strict';

    const rowWrapper = document.getElementById('row-wrapper');
    const template = document.querySelector('.row.template');
    const undoBtn = document.getElementById('undo');
    const clearBtn = document.getElementById('clear');
    const addRowBtn = document.getElementById('add-row');

    const MAX_HISTORY = 100;
    const history = [];

    const STORAGE_KEY = 'speech-counter-state-v1';
    let saveTimer = null;

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

    function hapticTap() {
        // Inside the Capacitor native shell, window.Capacitor is injected
        // automatically and routes to real iOS/Android haptics - this is
        // what actually gets iOS vibrating, since Safari's Vibration API
        // never did. No import/bundler needed: Capacitor's plugin bridge
        // is available as a global once running in the native app.
        const capacitor = window.Capacitor;
        if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()
            && capacitor.Plugins && capacitor.Plugins.Haptics) {
            capacitor.Plugins.Haptics.impact({ style: 'LIGHT' }).catch(() => {});
            return;
        }

        // Plain-browser fallback: Android Chrome supports short vibrations;
        // iOS Safari has no Vibration API and silently no-ops here.
        if (typeof navigator.vibrate === 'function') {
            navigator.vibrate(10);
        }
    }

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
        row.querySelector('.ticker.incorrect').textContent = incorrect;
        row.querySelector('.totalCount').textContent = total;
        row.querySelector('.percentValue').textContent = percent + '%';
    }

    function cloneTemplateRow() {
        const row = template.cloneNode(true);
        row.classList.remove('template');
        return row;
    }

    function serializeRows() {
        return Array.from(rowWrapper.querySelectorAll('.row:not(.template)')).map((row) => {
            const inputs = row.querySelectorAll('.name-fields input');
            const { correct, incorrect } = getRowCounts(row);
            return {
                name: inputs[0] ? inputs[0].value : '',
                target: inputs[1] ? inputs[1].value : '',
                correct,
                incorrect,
            };
        });
    }

    // Debounced so typing in a Name/Target field doesn't hit storage on
    // every keystroke; button actions still feel instant since 150ms is
    // well under human perception for a "did it save" concern.
    function saveState() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeRows()));
            } catch (err) {
                // Storage can be unavailable (private browsing, full, disabled) - not fatal.
            }
        }, 150);
    }

    function buildRowFromData(data) {
        const row = cloneTemplateRow();
        const inputs = row.querySelectorAll('.name-fields input');
        if (inputs[0]) inputs[0].value = data.name || '';
        if (inputs[1]) inputs[1].value = data.target || '';
        renderRow(row, data.correct || 0, data.incorrect || 0);
        return row;
    }

    function loadState() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch (err) {
            saved = null;
        }
        // Only bail when nothing has ever been saved (null/invalid JSON) -
        // an empty array is a legitimate saved state (the user deleted
        // every row) and should be restored as empty, not backfilled with
        // the default blank row from the markup.
        if (!Array.isArray(saved)) return;

        rowWrapper.querySelectorAll('.row:not(.template)').forEach((row) => row.remove());
        saved.forEach((data) => rowWrapper.appendChild(buildRowFromData(data)));
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
        saveState();
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
                    rowWrapper.appendChild(row);
                    playEnter(row);
                });
                break;
            }
        }

        undoBtn.disabled = history.length === 0;
        saveState();
    }

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
        if (event.target.matches('.name-fields input')) {
            saveState();
        }
    });

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

    loadState();

    document.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undo();
        }
    });
})();
