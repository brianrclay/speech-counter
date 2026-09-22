# Web feature and revenue analytics

The website reports feature usage to GA4 `G-QPE28RCTSV`. Native origins, local development, previews, and opted-out browsers do not load the web tag. Native analytics needs a separate app-stream implementation and store release.

## Feature events

- Board: `board_add`, `board_remove`, `board_clear`, `board_count`, `board_undo`.
- Roster: `student_create`, `student_rename`, `student_delete`, `student_view`, `students_sort`.
- Sessions: `session_save` (first saved record), `session_edit`, `session_delete`.
- Sync/export: `sync_complete`, `sync_error` (first failure, not every retry), `export_data`.
- Funnel: `paywall_view`, `select_plan`, `begin_checkout`, `checkout_complete`, `checkout_cancel`, `checkout_error`, `restore_purchases`, `redeem_code`, `sign_in`, `sign_out`.

Events never include names, email, student/session IDs, goals, tallies, or notes. Page titles are fixed to avoid student names in dynamic titles. Query strings and hashes are excluded from page URLs; basic UTM campaign fields are separately allowlisted. The analytics switch immediately disables the loaded tag and updates the signed-in account preference. Anonymous preference changes affect only that browser. An account opt-out cannot be overridden by an ordinary visit from another browser; explicitly switching on is required.

## Revenue setup

1. Store these production function environment variables in Netlify (never in Git): `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `RC_ANALYTICS_WEBHOOK_SECRET`.
2. Create a GA4 Measurement Protocol API secret on the existing Speech Count Web stream; use its value for `GA4_API_SECRET`.
3. Add RevenueCat webhook `https://speechcount.com/api/revenuecat-analytics`, authorization `Bearer <RC_ANALYTICS_WEBHOOK_SECRET>`, **Production only**, **Speech Count (RevenueCat Billing)**. Select initial purchase, non-renewing purchase, renewal, and cancellation events (or all events; the receiver filters them).
4. Deploy and send RevenueCat's `TEST` webhook. It returns 200 without recording fake revenue.
5. Validate a synthetic payload against GA's `/debug/mp/collect` endpoint, which does not enter reports. Confirm the next real consented web purchase in GA; allow normal processing time.

The browser stores its GA client/session IDs with its authenticated account before opening checkout. RevenueCat confirms payments independently of the browser. The receiver sends `purchase` with value, currency, items, and a store-prefixed transaction ID. A renewal uses its own transaction ID; a CUSTOMER_SUPPORT cancellation produces `refund`. Normal cancellations, free trials, promotional grants, unpaid invoices, family sharing, sandbox, native stores, and events older than 72 hours are ignored. Only accounts with a saved, enabled analytics context are eligible. Historical sales and existing customers without that context are not backfilled. Deleted accounts cannot supply analytics context.

Amounts use RevenueCat's `price_in_purchased_currency` (not USD-converted price or net payouts). Stripe/RevenueCat remain the accounting source of truth. Ad blockers, disabled analytics, and missing client IDs mean GA totals need not match Stripe. Initial purchases can join a recent checkout session; automatic renewals are not falsely attached to that old session.

Conditional receipt writes block parallel duplicate deliveries. Failures return 503 for RevenueCat retries. A 60-second lease permits recovery after crashes. Stable purchase transaction IDs provide an additional GA deduplication layer. As with any external HTTP delivery, an ambiguous timeout after GA accepted a refund can still duplicate a refund; reconcile exceptional discrepancies against billing records. Receipts retain only hashed transaction/event keys, processing state, and timestamps.

## Validation

Run `npm test` and `npm run build`. Tests cover purchase identity/recovery, opt-out and staging isolation, allowed analytics parameters, confirmed-payment filtering, renewals/refunds, duplicate delivery, and failure recovery. Do not send fabricated purchases to the production collection endpoint or make a real charge solely to test analytics.
