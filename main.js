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

    // Touch swipe-to-remove, iOS Mail style: dragging a row leftwards slides
    // its body over a Remove action on the right edge. A short swipe snaps
    // the action open; a long swipe or a quick fling carries the row off
    // and removes it. Mouse pointers are ignored - the Remove button covers
    // desktop.
    const swipe = (() => {
        const OPEN_WIDTH = 104;
        const DECIDE_DISTANCE = 8;
        const COMMIT_FRACTION = 0.55;
        const FLING_VELOCITY = 0.6;
        let openRow = null;
        let drag = null;
        let suppressClick = false;
        let suppressTimer = null;

        const bodyOf = (row) => row.querySelector('.row-body');
        const actionOf = (row) => row.querySelector('.row-swipe-action');

        function suppressNextClick() {
            suppressClick = true;
            clearTimeout(suppressTimer);
            suppressTimer = setTimeout(() => { suppressClick = false; }, 400);
        }

        function setOffset(row, x) {
            bodyOf(row).style.transform = x ? 'translateX(' + x + 'px)' : '';
            actionOf(row).style.width = -x > OPEN_WIDTH ? -x + 'px' : '';
        }

        function reset(row) {
            bodyOf(row).classList.remove('swiping');
            bodyOf(row).style.transform = '';
            actionOf(row).style.width = '';
            actionOf(row).classList.remove('will-remove');
            if (openRow === row) openRow = null;
        }

        function open(row) {
            if (openRow && openRow !== row) reset(openRow);
            openRow = row;
            bodyOf(row).classList.remove('swiping');
            actionOf(row).classList.remove('will-remove');
            setOffset(row, -OPEN_WIDTH);
        }

        function commit(row) {
            if (openRow === row) openRow = null;
            const body = bodyOf(row);
            actionOf(row).classList.add('will-remove');
            body.classList.remove('swiping');
            if (reducedMotion()) {
                deleteRow(row);
                return;
            }
            function onSlideEnd(event) {
                if (event.propertyName !== 'transform') return;
                body.removeEventListener('transitionend', onSlideEnd);
                deleteRow(row);
            }
            body.addEventListener('transitionend', onSlideEnd);
            setOffset(row, -row.offsetWidth);
        }

        function currentOffset(d) {
            return Math.min(0, d.startOffset + (d.lastX - d.startX));
        }

        rowWrapper.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' || event.button !== 0) return;
            if (event.target.closest('.row-swipe-action')) return;
            const body = event.target.closest('.row-body');
            if (openRow && (!body || body.closest('.row') !== openRow)) reset(openRow);
            if (!body) return;
            const row = body.closest('.row');
            if (row.classList.contains('row-exit')) return;
            drag = {
                row,
                body,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastT: event.timeStamp,
                velocity: 0,
                startOffset: openRow === row ? -OPEN_WIDTH : 0,
                active: false,
            };
        });

        rowWrapper.addEventListener('pointermove', (event) => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;

            if (!drag.active) {
                if (Math.abs(dy) > DECIDE_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
                    drag = null;
                    return;
                }
                if (Math.abs(dx) < DECIDE_DISTANCE) return;
                drag.active = true;
                drag.body.classList.add('swiping');
                drag.body.setPointerCapture(event.pointerId);
            }

            const dt = event.timeStamp - drag.lastT;
            if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt;
            drag.lastX = event.clientX;
            drag.lastT = event.timeStamp;

            const offset = currentOffset(drag);
            setOffset(drag.row, offset);

            const action = actionOf(drag.row);
            const willRemove = -offset > drag.row.offsetWidth * COMMIT_FRACTION;
            if (willRemove !== action.classList.contains('will-remove')) {
                action.classList.toggle('will-remove', willRemove);
                hapticTap();
            }
        });

        function endDrag(event) {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const d = drag;
            drag = null;

            if (!d.active) {
                // A plain tap on an open row just closes it.
                if (openRow === d.row) {
                    reset(d.row);
                    suppressNextClick();
                }
                return;
            }

            suppressNextClick();
            d.body.classList.remove('swiping');
            const offset = currentOffset(d);
            const width = d.row.offsetWidth;
            const flungLeft = d.velocity < -FLING_VELOCITY;
            const flungRight = d.velocity > FLING_VELOCITY;

            if (event.type === 'pointercancel') {
                reset(d.row);
            } else if (-offset > width * COMMIT_FRACTION || (flungLeft && -offset > OPEN_WIDTH)) {
                commit(d.row);
            } else if (-offset > OPEN_WIDTH / 2 && !flungRight) {
                open(d.row);
            } else {
                reset(d.row);
            }
        }
        rowWrapper.addEventListener('pointerup', endDrag);
        rowWrapper.addEventListener('pointercancel', endDrag);

        // The click that follows a swipe (or a tap that closed a row) must
        // not land on a ticker or input underneath.
        rowWrapper.addEventListener('click', (event) => {
            if (!suppressClick) return;
            suppressClick = false;
            clearTimeout(suppressTimer);
            event.stopPropagation();
            event.preventDefault();
        }, true);

        return { reset, commit };
    })();

    rowWrapper.addEventListener('click', (event) => {
        const tickBtn = event.target.closest('.ticker');
        if (tickBtn) {
            const kind = tickBtn.classList.contains('correct') ? 'correct' : 'incorrect';
            tick(tickBtn.closest('.row'), kind, tickBtn);
            return;
        }

        const swipeBtn = event.target.closest('.row-swipe-action');
        if (swipeBtn) {
            swipe.commit(swipeBtn.closest('.row'));
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
