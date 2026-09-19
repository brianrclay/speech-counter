// Touch swipe-to-remove, iOS Mail style, shared by the board rows and the
// student cards. Dragging an item leftwards slides its body over a Remove
// action on the right edge. A short swipe snaps the action open; a long
// swipe or a quick fling carries the item off and calls onRemove. Mouse
// pointers are ignored - each page has its own button for desktop.
(() => {
    'use strict';

    const OPEN_WIDTH = 104;
    const DECIDE_DISTANCE = 8;
    const COMMIT_FRACTION = 0.55;
    const FLING_VELOCITY = 0.6;

    function reducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function haptic() {
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

    // options: { container, item, body, action, onRemove(item), isDisabled?(item) }
    // Selectors are relative to the container; `body` is the sliding
    // element and `action` the button revealed beneath it.
    function attach(options) {
        const { container, onRemove } = options;
        const isDisabled = options.isDisabled || (() => false);
        let openItem = null;
        let drag = null;
        let suppressClick = false;
        let suppressTimer = null;

        const bodyOf = (item) => item.querySelector(options.body);
        const actionOf = (item) => item.querySelector(options.action);

        function suppressNextClick() {
            suppressClick = true;
            clearTimeout(suppressTimer);
            suppressTimer = setTimeout(() => { suppressClick = false; }, 400);
        }

        function setOffset(item, x) {
            bodyOf(item).style.transform = x ? 'translateX(' + x + 'px)' : '';
            actionOf(item).style.width = -x > OPEN_WIDTH ? -x + 'px' : '';
        }

        function reset(item) {
            bodyOf(item).classList.remove('swiping');
            bodyOf(item).style.transform = '';
            actionOf(item).style.width = '';
            actionOf(item).classList.remove('will-remove');
            if (openItem === item) openItem = null;
        }

        function open(item) {
            if (openItem && openItem !== item) reset(openItem);
            openItem = item;
            bodyOf(item).classList.remove('swiping');
            actionOf(item).classList.remove('will-remove');
            setOffset(item, -OPEN_WIDTH);
        }

        function commit(item) {
            if (openItem === item) openItem = null;
            const body = bodyOf(item);
            actionOf(item).classList.add('will-remove');
            body.classList.remove('swiping');
            if (reducedMotion()) {
                onRemove(item);
                return;
            }
            function onSlideEnd(event) {
                if (event.propertyName !== 'transform') return;
                body.removeEventListener('transitionend', onSlideEnd);
                onRemove(item);
            }
            body.addEventListener('transitionend', onSlideEnd);
            setOffset(item, -item.offsetWidth);
        }

        function currentOffset(d) {
            return Math.min(0, d.startOffset + (d.lastX - d.startX));
        }

        container.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' || event.button !== 0) return;
            if (event.target.closest(options.action)) return;
            const body = event.target.closest(options.body);
            const item = body && body.closest(options.item);
            if (openItem && item !== openItem) reset(openItem);
            if (!item || isDisabled(item)) return;
            drag = {
                item,
                body,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastT: event.timeStamp,
                velocity: 0,
                startOffset: openItem === item ? -OPEN_WIDTH : 0,
                active: false,
            };
        });

        container.addEventListener('pointermove', (event) => {
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
                try {
                    drag.body.setPointerCapture(event.pointerId);
                } catch (err) {
                    // Pointer already released; the drag still tracks via bubbling.
                }
            }

            const dt = event.timeStamp - drag.lastT;
            if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt;
            drag.lastX = event.clientX;
            drag.lastT = event.timeStamp;

            const offset = currentOffset(drag);
            setOffset(drag.item, offset);

            const action = actionOf(drag.item);
            const willRemove = -offset > drag.item.offsetWidth * COMMIT_FRACTION;
            if (willRemove !== action.classList.contains('will-remove')) {
                action.classList.toggle('will-remove', willRemove);
                haptic();
            }
        });

        function endDrag(event) {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const d = drag;
            drag = null;

            if (!d.active) {
                // A plain tap on an open item just closes it.
                if (openItem === d.item) {
                    reset(d.item);
                    suppressNextClick();
                }
                return;
            }

            suppressNextClick();
            d.body.classList.remove('swiping');
            const offset = currentOffset(d);
            const width = d.item.offsetWidth;
            const flungLeft = d.velocity < -FLING_VELOCITY;
            const flungRight = d.velocity > FLING_VELOCITY;

            if (event.type === 'pointercancel') {
                reset(d.item);
            } else if (-offset > width * COMMIT_FRACTION || (flungLeft && -offset > OPEN_WIDTH)) {
                commit(d.item);
            } else if (-offset > OPEN_WIDTH / 2 && !flungRight) {
                open(d.item);
            } else {
                reset(d.item);
            }
        }
        container.addEventListener('pointerup', endDrag);
        container.addEventListener('pointercancel', endDrag);

        // The click that follows a swipe (or a tap that closed an item) must
        // not land on whatever sits underneath.
        container.addEventListener('click', (event) => {
            if (suppressClick) {
                suppressClick = false;
                clearTimeout(suppressTimer);
                event.stopPropagation();
                event.preventDefault();
                return;
            }
            const action = event.target.closest(options.action);
            if (action) {
                event.preventDefault();
                commit(action.closest(options.item));
            }
        }, true);

        return { reset, commit };
    }

    window.SpeechSwipe = { attach, haptic };
})();
