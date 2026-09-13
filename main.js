(() => {
    'use strict';

    const rowWrapper = document.querySelector('.row-wrapper');
    const template = document.querySelector('.row.template');
    const undoBtn = document.getElementById('undo');
    const clearBtn = document.getElementById('clear');
    const addRowBtn = document.getElementById('add-row');

    const MAX_HISTORY = 100;
    const history = [];

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

    function tick(row, kind) {
        const { correct, incorrect } = getRowCounts(row);
        if (kind === 'correct') {
            renderRow(row, correct + 1, incorrect);
        } else {
            renderRow(row, correct, incorrect + 1);
        }
        pushHistory({ type: 'tick', row, kind });
    }

    function deleteRow(row) {
        const nextSibling = row.nextElementSibling;
        row.remove();
        pushHistory({ type: 'deleteRow', row, nextSibling });
    }

    function reinsertRow(row, nextSibling) {
        if (nextSibling && nextSibling.parentNode === rowWrapper) {
            rowWrapper.insertBefore(row, nextSibling);
        } else {
            rowWrapper.appendChild(row);
        }
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
                action.row.remove();
                break;
            }
            case 'deleteRow': {
                reinsertRow(action.row, action.nextSibling);
                break;
            }
            case 'clear': {
                Array.from(rowWrapper.querySelectorAll('.row:not(.template)')).forEach((row) => row.remove());
                action.rows.forEach((row) => rowWrapper.appendChild(row));
                break;
            }
        }

        undoBtn.disabled = history.length === 0;
    }

    rowWrapper.addEventListener('click', (event) => {
        const tickBtn = event.target.closest('.ticker');
        if (tickBtn) {
            const kind = tickBtn.classList.contains('correct') ? 'correct' : 'incorrect';
            tick(tickBtn.closest('.row'), kind);
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
        pushHistory({ type: 'addRow', row });
    });

    clearBtn.addEventListener('click', () => {
        const rows = Array.from(rowWrapper.querySelectorAll('.row:not(.template)'));
        rows.forEach((row) => row.remove());
        rowWrapper.appendChild(cloneTemplateRow());
        pushHistory({ type: 'clear', rows });
    });

    undoBtn.addEventListener('click', undo);

    document.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undo();
        }
    });
})();
