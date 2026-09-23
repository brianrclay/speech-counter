# Web default-plan test

Experiment: `web_default_plan_v1`. Eligible browsers get a random 50/50
Lifetime or Monthly default on first paywall display. Both purchase controls
use that default; visitors can still select either plan. Prices, order, and
other content stay the same. The assignment persists in localStorage.
Native apps, analytics opt-outs, and browsers without working storage keep
Lifetime and are not enrolled. Clearing storage or using another browser
can assign a different group; this is a browser-level test, not an account-level test.

## Reporting setup before launch

In GA4 Admin > Custom definitions, create event-scoped dimensions for
`experiment_id`, `variant_id`, and `item_id` (selected plan). This repository
does not configure the GA4 property. Reporting can take 24–48 hours after setup.
See https://support.google.com/analytics/answer/14239696.

Create a closed Funnel exploration filtered to `experiment_id` =
`web_default_plan_v1`, broken down by `variant_id`, with steps:

1. `paywall_view`
2. `paywall_cta_click`
3. `begin_checkout`

The primary metric is unique users clicking the purchase button divided by
unique users viewing the paywall, per variant. Count users, not raw clicks,
so repeated taps and visits do not inflate the rate. Compare by assigned
variant, even when someone selects the other plan. `item_id` records the
plan actually clicked. Both the inline and sticky buttons emit
click events, before sign-in or store availability checks; the sign-in retry
does not emit another click. Views emit once per page load.

Decide the sample size and minimum worthwhile lift before evaluating a winner;
run across full weekly cycles and report uncertainty, not just which rate is
larger. Check checkout-start rates as a secondary outcome. More clicks alone
do not establish higher revenue. GA records usage, paywall views, plan choices,
clicks, and checkout starts only. RevenueCat remains the separate source for
purchases, renewals, refunds, and revenue. No purchase data or account-linked
GA identifiers are synced between the services. There is no purchase-analytics
consent prompt. Opt-outs and blockers are absent from analytics; results
represent measured visitors.

## Verification and stopping

Run `node scripts/check-plan-experiment.cjs`. Existing analytics loading rules
exclude HTTP local development and Netlify preview domains from production
analytics. For local QA, set localStorage key
`speech-counter:experiment:web_default_plan_v1` to `monthly` or `lifetime`
and reload Students. Check both radio groups, both purchase labels, and
switching plans. Do not force assignments on production for QA.

Set `PLAN_EXPERIMENT_ENABLED` in billing.js to false to stop enrollment and
return to the Lifetime default. Use a new experiment ID if the test changes
or restarts. Deploying the code starts the test; no deployment is performed
by these changes.


## Reporting status

The three event-scoped dimensions were verified September 22, 2026.
Saved exploration: https://analytics.google.com/analytics/web/?authuser=2#/analysis/a137812339p553947714/edit/kp8hTOqyQtmnZTLECFgIcw
Use only the three usage steps listed above; revenue reporting stays in RevenueCat.
