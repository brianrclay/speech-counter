(() => {
    'use strict';

    const store = window.SpeechStore;
    const billing = window.SpeechBilling;
    const account = window.SpeechAccount;

    const appHeader = document.querySelector('.app-header');
    const appActions = document.querySelector('.app-actions');
    const paywall = document.getElementById('paywall');
    const paywallStatus = document.getElementById('paywall-status');
    const paywallSigninToggle = document.getElementById('paywall-signin-toggle');
    const restoreBtn = document.getElementById('restore-purchases');
    const couponToggle = document.getElementById('paywall-coupon-toggle');
    const couponForm = document.getElementById('paywall-coupon-form');
    const couponInput = document.getElementById('paywall-coupon-input');
    const couponSubmit = couponForm.querySelector('button');
    const couponStatus = document.getElementById('paywall-coupon-status');
    const planButtons = [...document.querySelectorAll('.plan[data-package]')];
    const paywallExport = document.getElementById('paywall-export');
    const paywallExportCount = document.getElementById('paywall-export-count');
    const paywallExportBtn = document.getElementById('paywall-export-btn');
    const storageBanner = document.getElementById('storage-banner');
    const buyBtn = document.getElementById('buy');
    const buyButtons = [buyBtn, document.getElementById('sticky-buy')];
    const buyLabel = document.getElementById('buy-label');
    const buyPrice = document.getElementById('buy-price');
    const purchaseDone = document.getElementById('purchase-done');
    const purchaseFinish = document.getElementById('purchase-finish');
    const tabBar = document.querySelector('.tab-bar');
    const billingBanner = document.getElementById('billing-banner');
    const billingBannerLink = document.getElementById('billing-banner-link');
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
    const template = document.querySelector('.row.template');
    const addStudentBtn = document.getElementById('add-student');
    const addStudentForm = document.getElementById('add-student-form');
    const newStudentName = document.getElementById('new-student-name');
    const cancelAddStudent = document.getElementById('cancel-add-student');
    const listToolbar = document.querySelector('.list-toolbar');
    const sortBtn = document.getElementById('sort-btn');
    const sortMenu = document.getElementById('sort-options');
    const sortItems = [...sortMenu.querySelectorAll('.menu-item')];
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

    const SORT_KEY = 'speech-counter:student-sort';
    const SORTS = {
        updated: (a, b) => (a.changedAt > b.changedAt ? -1 : a.changedAt < b.changedAt ? 1 : 0),
        name: (a, b) => a.student.name.localeCompare(b.student.name, undefined, { sensitivity: 'base' }),
    };
    let sortMode = 'updated';
    try {
        if (SORTS[localStorage.getItem(SORT_KEY)]) sortMode = localStorage.getItem(SORT_KEY);
    } catch (err) {
        // Storage unavailable; the default applies.
    }

    function percentOf(correct, incorrect) {
        const total = correct + incorrect;
        return total === 0 ? 0 : Math.ceil((correct / total) * 100);
    }

    function plural(count, word) {
        return count + ' ' + word + (count === 1 ? '' : 's');
    }

    function renderList() {
        const key = store.nameKey(searchInput.value);
        const summaries = store.sessions.summaryMap();
        const empty = { count: 0, trials: 0, correct: 0, percent: 0, lastAt: null };
        const students = store.students.list()
            .filter((s) => !key || s.nameKey.includes(key))
            .map((student) => {
                const summary = summaries.get(student.id) || empty;
                return { student, summary, changedAt: summary.lastAt || student.updatedAt };
            })
            .sort(SORTS[sortMode]);

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
                : plural(summary.count, 'session') + ' \u2022 Last ' + shortDayFormat.format(new Date(summary.lastAt));

            const percent = document.createElement('span');
            percent.className = 'student-card-percent';
            percent.textContent = summary.trials === 0 ? '–' : summary.percent + '%';
            if (summary.trials !== 0) {
                const label = document.createElement('span');
                label.className = 'sr-only';
                label.textContent = ' correct';
                percent.appendChild(label);
            }
            card.setAttribute('aria-describedby', 'select-hint');

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

    // Space is the keyboard route into select mode (and toggles once there).
    studentList.addEventListener('keydown', (event) => {
        if (event.key !== ' ') return;
        const card = event.target.closest('.student-card');
        if (!card) return;
        event.preventDefault();
        if (selecting) toggleSelected(card.dataset.id);
        else enterSelectMode(card.dataset.id);
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
        // Tapping the circle is a shortcut for the long press.
        if (!selecting && event.target.closest('.student-check')) {
            event.preventDefault();
            enterSelectMode(card.dataset.id);
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
        const summaries = store.sessions.summaryMap();
        const sessionCount = ids.reduce((sum, id) => sum + ((summaries.get(id) || {}).count || 0), 0);
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

    let shownPremium = null;
    // null, or which of CELEBRATIONS to show instead of the list.
    let celebrating = null;

    const CELEBRATIONS = {
        purchase: { title: 'Purchase completed', lead: "We've emailed you a receipt. Happy counting!" },
        coupon: { title: "You're all set", lead: 'Your code unlocked Speech Count Pro. Happy counting!' },
    };

    function showRoute(match) {
        const premium = store.entitlements.isPremium();
        shownPremium = premium;
        purchaseDone.hidden = !celebrating;
        tabBar.hidden = Boolean(celebrating);
        document.body.classList.toggle('celebrating', Boolean(celebrating));
        appHeader.hidden = !premium || Boolean(celebrating);
        paywall.hidden = premium || Boolean(celebrating);
        appActions.hidden = !premium;
        if (celebrating) {
            const copy = CELEBRATIONS[celebrating];
            currentId = null;
            detailView.hidden = true;
            listView.hidden = true;
            purchaseDone.querySelector('.purchase-done-title').textContent = copy.title;
            purchaseDone.querySelector('.purchase-done-lead').textContent = copy.lead;
            document.title = copy.title + ' - Speech Count';
            window.scrollTo(0, 0);
            purchaseDone.querySelector('.purchase-done-title').focus();
            return;
        }
        if (!premium) {
            currentId = null;
            detailView.hidden = true;
            listView.hidden = true;
            appHeader.hidden = true;
            document.title = 'Students - Speech Count';
            renderPaywall();
            window.scrollTo(0, 0);
            return;
        }
        renderBillingBanner();
        if (match) {
            selecting = false;
            selected.clear();
            appHeader.hidden = true;
            listView.hidden = true;
            detailView.hidden = false;
            renderDetail(match[1]);
        } else {
            currentId = null;
            detailView.hidden = true;
            appHeader.hidden = false;
            listView.hidden = false;
            document.title = 'Students - Speech Count';
            renderList();
        }
        window.scrollTo(0, 0);
    }

    let routed = false;

    function route() {
        const match = store.entitlements.isPremium() ? location.hash.match(/^#student\/([\w-]+)$/) : null;
        const animate = routed && document.startViewTransition
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        routed = true;
        if (!animate) {
            showRoute(match);
            return;
        }
        document.documentElement.dataset.nav = match ? 'forward' : 'back';
        const transition = document.startViewTransition(() => showRoute(match));
        transition.ready.catch(() => {});
        transition.finished
            .catch(() => {})
            .then(() => { delete document.documentElement.dataset.nav; });
    }

    searchInput.addEventListener('input', renderList);

    // Sort menu: a small popover under the icon button; the choice persists.
    function renderSortMenu() {
        sortItems.forEach((item) => item.setAttribute('aria-checked', item.dataset.sort === sortMode ? 'true' : 'false'));
    }

    function openSortMenu() {
        renderSortMenu();
        sortMenu.hidden = false;
        sortBtn.setAttribute('aria-expanded', 'true');
        (sortItems.find((item) => item.dataset.sort === sortMode) || sortItems[0]).focus();
    }

    function closeSortMenu(refocus) {
        if (sortMenu.hidden) return;
        sortMenu.hidden = true;
        sortBtn.setAttribute('aria-expanded', 'false');
        if (refocus) sortBtn.focus();
    }

    function setSort(mode) {
        sortMode = mode;
        try {
            localStorage.setItem(SORT_KEY, mode);
        } catch (err) {
            // Storage unavailable; the choice lasts for this page.
        }
        renderSortMenu();
        renderList();
    }

    sortBtn.addEventListener('click', () => {
        if (sortMenu.hidden) openSortMenu();
        else closeSortMenu(true);
    });

    sortItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            setSort(item.dataset.sort);
            closeSortMenu(true);
        });
        item.addEventListener('keydown', (event) => {
            const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
            if (step) {
                event.preventDefault();
                sortItems[(index + step + sortItems.length) % sortItems.length].focus();
            }
        });
    });

    document.addEventListener('click', (event) => {
        if (!sortMenu.hidden && !event.target.closest('.sort-menu')) closeSortMenu(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !sortMenu.hidden) {
            event.stopPropagation();
            closeSortMenu(true);
        }
    });

    renderSortMenu();

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
        const csv = store.exportCSV();
        const filename = 'speech-count-' + new Date().toISOString().slice(0, 10) + '.csv';
        const capacitor = window.Capacitor;
        const share = capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()
            && capacitor.Plugins && capacitor.Plugins.Share;

        if (share) {
            try {
                await share.share({ title: filename, text: csv });
            } catch (err) {
                // User dismissed the share sheet.
            }
            return;
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    exportBtn.addEventListener('click', exportBackup);
    paywallExportBtn.addEventListener('click', exportBackup);

    window.addEventListener('speech:storage-error', () => { storageBanner.hidden = false; });
    storageBanner.hidden = !store.storageFailed();

    // Paywall

    let paywallViewed = false;
    let pricesLoaded = false;
    let offerings = [];
    let selectedPackage = 'lifetime';

    const BUY_LABELS = { lifetime: 'Purchase lifetime', monthly: 'Subscribe monthly' };

    function setPaywallStatus(text) {
        paywallStatus.textContent = text || '';
        document.getElementById('sticky-paywall-status').textContent = text || '';
    }

    function priceFor(packageId) {
        const price = document.querySelector('[data-price="' + packageId + '"]');
        return price ? price.textContent : '';
    }

    function selectPlan(packageId) {
        selectedPackage = packageId;
        planButtons.forEach((button) => {
            const selected = button.dataset.package === packageId;
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
            button.tabIndex = selected ? 0 : -1;
        });
        buyLabel.textContent = BUY_LABELS[packageId] || 'Purchase';
        buyPrice.textContent = priceFor(packageId);
        document.getElementById('sticky-buy-label').textContent = buyLabel.textContent;
        document.getElementById('sticky-buy-price').textContent = buyPrice.textContent;
    }

    function renderPaywall() {
        if (!paywallViewed) {
            paywallViewed = true;
            billing.track('paywall_view', { platform: billing.platform() });
        }
        selectPlan(selectedPackage);
        // Records already on the device stay exportable after Pro lapses.
        const saved = store.students.list().length;
        paywallExport.hidden = saved === 0;
        paywallExportCount.textContent = plural(saved, 'student');
        if (pricesLoaded) return;
        pricesLoaded = true;
        billing.offerings().then((packages) => {
            offerings = packages;
            packages.forEach((pkg) => {
                document.querySelectorAll('[data-price="' + pkg.id + '"]').forEach((price) => {
                    if (pkg.price) price.textContent = pkg.price + (pkg.id === 'monthly' ? '/mo' : '');
                });
            });
            selectPlan(selectedPackage);
            restoreBtn.hidden = !billing.canRestore();
        }).catch(() => {
            // Prices stay at their defaults; buttons still try the store on tap.
            pricesLoaded = false;
        });
    }

    function afterEntitlementChange() {
        if (store.entitlements.isPremium() !== shownPremium) route();
    }

    async function buy(packageId) {
        const pkg = offerings.find((p) => p.id === packageId);
        if (!pkg) {
            setPaywallStatus("The store isn't available right now. Check your connection and try again.");
            return;
        }
        if (billing.platform() === 'web' && !account.session()) {
            const plan = planButtons.find((b) => b.dataset.package === packageId);
            window.SpeechSheet.open({ plan: plan.querySelector('.plan-body'), onSignedIn: () => buy(packageId) });
            return;
        }
        setPaywallStatus('');
        buyButtons.forEach((button) => { button.disabled = true; });
        planButtons.forEach((b) => { b.disabled = true; });
        try {
            const entitlement = await billing.purchase(pkg);
            if (entitlement && entitlement.active) {
                celebrating = 'purchase';
                route();
            } else if (entitlement) {
                setPaywallStatus("The purchase went through but isn't active yet. Try Restore purchases in a moment.");
            }
        } catch (err) {
            setPaywallStatus(err.message || 'The purchase could not be completed.');
        } finally {
            buyButtons.forEach((button) => { button.disabled = false; });
            planButtons.forEach((b) => { b.disabled = false; });
        }
    }

    planButtons.forEach((button) => {
        button.addEventListener('click', () => selectPlan(button.dataset.package));
        button.addEventListener('keydown', (event) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
            if (!step) return;
            event.preventDefault();
            const group = [...button.closest('.plans').querySelectorAll('.plan')];
            const next = group[(group.indexOf(button) + step + group.length) % group.length];
            selectPlan(next.dataset.package);
            next.focus();
        });
    });

    buyButtons.forEach((button) => button.addEventListener('click', () => buy(selectedPackage)));

    purchaseFinish.addEventListener('click', () => {
        celebrating = null;
        route();
    });

    paywallSigninToggle.addEventListener('click', () => {
        window.SpeechSheet.open({
            title: 'Sign in',
            onSignedIn: async () => {
                try {
                    await billing.refresh();
                } catch (err) {
                    // Cached entitlement stands.
                }
                if (store.entitlements.isPremium()) route();
                else setPaywallStatus("Signed in, but there's no Speech Count Pro purchase on this email yet.");
            },
        });
    });

    restoreBtn.addEventListener('click', async () => {
        setPaywallStatus('Checking with the store...');
        try {
            const entitlement = await billing.restore();
            if (entitlement.active) {
                route();
            } else {
                setPaywallStatus('No Speech Count Pro purchase was found for this store account.');
            }
        } catch (err) {
            setPaywallStatus(err.message || "Couldn't restore purchases right now.");
        }
    });

    // Redeeming a coupon calls our server, which grants the RevenueCat
    // entitlement directly - so it needs the same signed-in account a code
    // was issued against. Codes are web-only: the stores treat an in-app
    // unlock mechanism of our own as a policy violation (App Store Review
    // 3.1.1), while a grant made on the web follows the account into the
    // app on sign-in, which they allow.
    couponToggle.hidden = billing.platform() !== 'web';

    function setCouponStatus(text) {
        couponStatus.textContent = text || '';
    }

    couponToggle.addEventListener('click', () => {
        setCouponStatus('');
        if (couponForm.hidden && !account.session()) {
            window.SpeechSheet.open({
                title: 'Sign in',
                onSignedIn: () => {
                    couponForm.hidden = false;
                    couponInput.focus();
                },
            });
            return;
        }
        couponForm.hidden = !couponForm.hidden;
        if (!couponForm.hidden) couponInput.focus();
    });

    couponForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const code = couponInput.value.trim();
        const session = account.session();
        if (!session) return;
        if (!code) {
            setCouponStatus('Enter a code.');
            couponInput.focus();
            return;
        }
        setCouponStatus('Checking your code...');
        couponSubmit.disabled = true;
        try {
            await account.call('/api/redeem-code', { code }, session.token);
            await billing.refresh();
            if (store.entitlements.isPremium()) {
                billing.track('redeem_code', { platform: billing.platform() });
                setCouponStatus('');
                couponInput.value = '';
                couponForm.hidden = true;
                celebrating = 'coupon';
                route();
            } else {
                setCouponStatus('Code applied, but Pro is not showing yet. Try again in a moment.');
            }
        } catch (err) {
            setCouponStatus(err.message || "That code didn't work.");
            couponInput.focus();
        } finally {
            couponSubmit.disabled = false;
        }
    });

    function renderBillingBanner() {
        const entitlement = store.entitlements.get() || {};
        billingBanner.hidden = !entitlement.billingIssueAt;
        if (entitlement.managementURL) billingBannerLink.href = entitlement.managementURL;
    }

    window.addEventListener('speech:entitlement', () => {
        renderBillingBanner();
        afterEntitlementChange();
    });
    window.addEventListener('speech:changed', () => {
        if (!store.entitlements.isPremium()) return;
        if (currentId) renderDetail(currentId);
        else renderList();
    });

    window.addEventListener('hashchange', route);

    store.ready().then(() => {
        route();
        billing.refresh().catch(() => {});
    });
})();

// Native scrolling supports touch, trackpads, and a usable no-JS fallback.
(() => {
    const track = document.getElementById('pro-feature-track');
    if (!track) return;
    const cards = [...track.querySelectorAll('.pro-feature-card')];
    const controls = document.querySelector('.pro-carousel-controls');
    const previous = controls.querySelector('[data-feature-direction="-1"]');
    const next = controls.querySelector('[data-feature-direction="1"]');
    const position = document.getElementById('pro-feature-position');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = 0;
    let frame;

    function offsets() {
        const start = cards[0].getBoundingClientRect().left;
        const maximum = track.scrollWidth - track.clientWidth;
        return cards.map((card) => Math.min(maximum, card.getBoundingClientRect().left - start));
    }

    function update() {
        if (!track.clientWidth) return;
        const positions = offsets();
        active = positions.reduce((best, offset, index) =>
            Math.abs(offset - track.scrollLeft) < Math.abs(positions[best] - track.scrollLeft) ? index : best, 0);
        position.textContent = `${active + 1} / ${cards.length}`;
        previous.disabled = active === 0;
        next.disabled = active === cards.length - 1;
    }

    function go(index) {
        active = Math.max(0, Math.min(cards.length - 1, index));
        track.scrollTo({ left: offsets()[active], behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }

    previous.addEventListener('click', () => go(active - 1));
    next.addEventListener('click', () => go(active + 1));
    track.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        go(event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1));
    });
    track.addEventListener('scroll', () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
    }, { passive: true });
    new ResizeObserver(update).observe(track);
    controls.hidden = false;
    update();
})();

// Reserve the dock's actual height, including wrapped purchase errors or text.
(() => {
    const dock = document.querySelector('.pro-purchase-dock');
    if (!dock) return;
    new ResizeObserver(() => {
        const height = dock.getBoundingClientRect().height;
        if (!height) return;
        const value = `${height}px`;
        document.getElementById('paywall').style.setProperty('--purchase-dock-height', value);
        document.documentElement.style.setProperty('--purchase-dock-height', value);
    }).observe(dock);
})();

// Yield to the in-page purchase section whenever it enters the usable viewport.
(() => {
    const dock = document.querySelector('.pro-purchase-dock');
    const inline = document.getElementById('pro-inline-purchase');
    const tabs = document.querySelector('.tab-bar');
    let frame;
    function update() {
        const rect = inline.getBoundingClientRect();
        const visible = rect.height > 0 && rect.top < tabs.getBoundingClientRect().top - 12 && rect.bottom > 0;
        if (visible && dock.contains(document.activeElement)) {
            const active = document.activeElement;
            const target = active.dataset.package
                ? inline.querySelector(`[data-package="${active.dataset.package}"]`)
                : document.getElementById('buy');
            target.focus({ preventScroll: true });
        }
        dock.classList.toggle('is-offscreen', visible);
        dock.inert = visible;
        dock.setAttribute('aria-hidden', String(visible));
    }
    function schedule() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    new ResizeObserver(schedule).observe(document.getElementById('paywall'));
    update();
})();
