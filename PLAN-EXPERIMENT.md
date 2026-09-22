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
4. `purchase`

The primary metric is unique users clicking the purchase button divided by
unique users viewing the paywall, per variant. Count users, not raw clicks,
so repeated taps and visits do not inflate the rate. Compare by assigned
variant, even when someone selects the other plan. `item_id` records the
plan actually clicked or purchased. Both the inline and sticky buttons emit
click events, before sign-in or store availability checks; the sign-in retry
does not emit another click. Views emit once per page load.

Decide the sample size and minimum worthwhile lift before evaluating a winner;
run across full weekly cycles and report uncertainty, not just which rate is
larger. Check checkout/purchase rates as secondary outcomes. More clicks alone
do not establish higher revenue. Verified purchase events come from the RevenueCat webhook for users who separately opt in to purchase analytics. Revenue comparisons therefore cover consenting, measured users. Browser completion uses checkout_complete to avoid duplicate purchases. Opt-outs and blockers are absent
from analytics; results represent measured visitors.

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


## Revenue activation

The production webhook is `/api/revenuecat-analytics`. It accepts only requests
with `Authorization: Bearer <RC_ANALYTICS_WEBHOOK_SECRET>` and production web
billing events. Configure `GA4_MEASUREMENT_ID=G-QPE28RCTSV`, `GA4_API_SECRET`,
and `RC_ANALYTICS_WEBHOOK_SECRET` as production Netlify function secrets.
Do not place secrets in source or browser assets.

Create a RevenueCat production-only webhook for the Speech Count RevenueCat
Billing app with all event types. Non-revenue events are ignored. Test with
RevenueCat's TEST event, and validate a synthetic payload with GA's debug
Measurement Protocol endpoint (which does not record revenue), before enabling
live reporting. Real-event receipt in GA remains to be verified after launch.

Purchase analytics is a separate, default-off consent. The checkout prompt
and Account privacy control explain the account link; ordinary usage analytics
alone does not authorize storing GA identifiers with the account. Revocations
remove those identifiers on the next successful server update. No historical
payments are backfilled. Delivery receipts deduplicate retries; GA transaction
IDs also deduplicate purchase sends after an interrupted acknowledgement.

Reporting setup verified September 22, 2026: all three event-scoped dimensions
exist. Saved funnel: https://analytics.google.com/analytics/web/?authuser=2#/analysis/a137812339p553947714/edit/kp8hTOqyQtmnZTLECFgIcw
