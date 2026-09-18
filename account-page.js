// The Account tab: who is signed in, what plan they have, and the two
// destructive actions (log out, delete account). Purchasing lives on the
// Students page paywall; this page only reports and manages.
(() => {
    'use strict';

    const store = window.SpeechStore;
    const billing = window.SpeechBilling;
    const account = window.SpeechAccount;

    const billingBanner = document.getElementById('billing-banner');
    const billingBannerLink = document.getElementById('billing-banner-link');
    const promo = document.getElementById('account-promo');
    const signedOut = document.getElementById('account-signed-out');
    const details = document.getElementById('account-details');
    const planSection = document.getElementById('account-plan');
    const signinBtn = document.getElementById('account-signin');
    const emailEl = document.getElementById('account-email');
    const syncStatus = document.getElementById('account-sync-status');
    const supportId = document.getElementById('support-id');
    const planMeta = document.getElementById('plan-meta');
    const planStatus = document.getElementById('plan-status');
    const manageSubscription = document.getElementById('manage-subscription');
    const manageSubscriptionLabel = document.getElementById('manage-subscription-label');
    const planCta = document.getElementById('plan-cta');
    const restoreBtn = document.getElementById('restore-purchases');
    const danger = document.getElementById('account-danger');
    const deleteBtn = document.getElementById('account-delete');
    const signoutBtn = document.getElementById('account-signout');

    const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    const SYNC_LABELS = {
        idle: 'Synced',
        syncing: 'Syncing...',
        error: "Couldn't sync - will retry",
        'signed-out': 'Signed out',
        off: 'Sync paused',
    };

    let prices = null;

    function renderDetails() {
        const session = account.session();
        const premium = store.entitlements.isPremium();
        const entitlement = store.entitlements.get() || {};
        promo.hidden = Boolean(session) || premium;
        signedOut.hidden = Boolean(session);
        details.hidden = !session;
        planSection.hidden = !session && !premium;
        danger.hidden = !session;
        if (session) {
            emailEl.textContent = session.email;
            syncStatus.textContent = SYNC_LABELS[window.SpeechSync.status().status] || 'Synced';
        }
        supportId.textContent = entitlement.appUserId || (session && session.userId) || '-';
    }

    function renderPlan() {
        const entitlement = store.entitlements.get() || {};
        const premium = store.entitlements.isPremium();
        const price = prices && entitlement.productId && prices[entitlement.productId];
        planStatus.className = 'plan-status';
        manageSubscriptionLabel.textContent = 'Manage subscription';
        if (!premium) {
            planStatus.textContent = 'Not active';
            planMeta.textContent = 'Manage all your students and sync across your devices.';
        } else if (entitlement.billingIssueAt) {
            planStatus.textContent = 'Payment issue';
            planStatus.classList.add('issue');
            planMeta.textContent = ['Update your payment method to keep Pro', price].filter(Boolean).join(' \u2022 ');
        } else if (!entitlement.expiresAt) {
            planStatus.textContent = 'Active';
            planStatus.classList.add('active');
            planMeta.textContent = ['Lifetime', price].filter(Boolean).join(' \u2022 ');
        } else if (entitlement.willRenew) {
            planStatus.textContent = 'Active';
            planStatus.classList.add('active');
            planMeta.textContent = ['Renews ' + dateFormat.format(new Date(entitlement.expiresAt)), price].filter(Boolean).join(' \u2022 ');
        } else {
            planStatus.textContent = 'Expiring soon';
            planMeta.textContent = ['Expires on ' + dateFormat.format(new Date(entitlement.expiresAt)), price].filter(Boolean).join(' \u2022 ');
            manageSubscriptionLabel.textContent = 'Resubscribe';
        }
        manageSubscription.hidden = !(premium && entitlement.managementURL);
        if (entitlement.managementURL) manageSubscription.href = entitlement.managementURL;
        planCta.hidden = premium;
        restoreBtn.hidden = premium || !billing.canRestore();

        billingBanner.hidden = !entitlement.billingIssueAt;
        if (entitlement.managementURL) billingBannerLink.href = entitlement.managementURL;
    }

    function render() {
        renderDetails();
        renderPlan();
    }

    function loadPrices() {
        if (!store.entitlements.isPremium()) return;
        billing.offerings().then((packages) => {
            prices = {};
            packages.forEach((pkg) => {
                if (pkg.productId && pkg.price) prices[pkg.productId] = pkg.price + (pkg.id === 'monthly' ? '/mo' : '');
            });
            renderPlan();
        }).catch(() => {});
    }

    signinBtn.addEventListener('click', () => {
        window.SpeechSheet.open({
            title: 'Log in',
            onSignedIn: () => {
                render();
                billing.refresh().then(loadPrices).catch(() => {});
            },
        });
    });

    signoutBtn.addEventListener('click', async () => {
        const session = account.session();
        if (!session || !confirm('Log out of ' + session.email + '? Your roster stays on this device.')) return;
        const removeLocal = confirm('Also remove the roster from this device?\n\nChoose OK on a shared device. Your roster stays in your account.');
        await account.signOut({ removeLocal });
        render();
    });

    deleteBtn.addEventListener('click', async () => {
        const session = account.session();
        if (!session) return;
        const message = 'Delete the Speech Count account for ' + session.email + '?\n\n'
            + 'This removes your synced roster from Speech Count and from this device, and logs you out. '
            + 'It cannot be undone. A subscription is cancelled separately through Manage subscription.';
        if (!confirm(message)) return;
        deleteBtn.disabled = true;
        window.SpeechSync.stop();
        try {
            await account.call('/api/account-delete', {}, session.token);
            await account.signOut({ removeLocal: true });
            render();
            alert('Your account has been deleted.');
        } catch (err) {
            alert(err.message || "Couldn't delete your account right now.");
        } finally {
            deleteBtn.disabled = false;
        }
    });

    restoreBtn.addEventListener('click', async () => {
        restoreBtn.disabled = true;
        try {
            const entitlement = await billing.restore();
            if (!entitlement.active) alert('No Speech Count Pro purchase was found for this store account.');
        } catch (err) {
            alert(err.message || "Couldn't restore purchases right now.");
        } finally {
            restoreBtn.disabled = false;
        }
    });

    const analyticsToggle = document.getElementById('analytics-toggle');
    try {
        analyticsToggle.checked = localStorage.getItem('speech-counter:analytics') !== 'off';
    } catch (err) {
        analyticsToggle.checked = true;
    }
    analyticsToggle.addEventListener('change', () => {
        try {
            if (analyticsToggle.checked) localStorage.removeItem('speech-counter:analytics');
            else localStorage.setItem('speech-counter:analytics', 'off');
        } catch (err) {
            // Storage unavailable; the default (on) applies.
        }
    });

    window.addEventListener('speech:sync', () => {
        if (!details.hidden) renderDetails();
    });
    window.addEventListener('speech:session', render);
    window.addEventListener('speech:entitlement', render);

    store.ready().then(() => {
        render();
        billing.refresh().then(loadPrices).catch(() => {});
    });
})();
