(() => {
    'use strict';

    const rowWrapper = document.getElementById('row-wrapper');
    const template = document.querySelector('.row.template');
    const undoBtn = document.getElementById('undo');
    const clearBtn = document.getElementById('clear');
    const addRowBtn = document.getElementById('add-row');

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

    function hapticTap() {
        // Android Chrome supports short vibrations for tactile feedback;
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
    }

    function deleteRow(row) {
        const nextSibling = row.nextElementSibling;
        playExitThenRemove(row, () => {
            pushHistory({ type: 'deleteRow', row, nextSibling });
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
                playExitThenRemove(action.row, () => {});
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

    addRowBtn.addEventListener('click', () => {
        const row = cloneTemplateRow();
        rowWrapper.appendChild(row);
        playEnter(row);
        pushHistory({ type: 'addRow', row });
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
                }
            });
        });
    });

    undoBtn.addEventListener('click', undo);

    document.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undo();
        }
    });
})();
