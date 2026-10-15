# Post-Clear Pro suggestion: development review

This branch is a review candidate, not a production release. `REVIEW-BASELINE.md` explains the separately committed frontend baseline ahead of master.

## Reproduce anywhere (no Mac secrets)

Use Node 22, then `npm ci`, `npm run test:review`, `npm run build:review`.
Serve `review-dist` using any static server. For Netlify use `netlify.review.toml` and publish `review-dist` with the deliberately empty functions directory. Never use `--prod` against the Speech Count production site.

The review build has no API functions, scheduled jobs, authentication, payment SDK or analytics SDK. Billing/account/sync/analytics are local mocks; CSP blocks every connect request and form submission. Prices are illustrative. Source billing/auth defaults remain unchanged; the review mock extracts the same plan-default function.

## Try the suggestion

On a fresh review origin, enter a fictional name, count at least ten trials in that row, then press Clear and wait for the existing row animation. The card replaces the small Pro link. Undo restores the original board exactly and hides the suggestion. A new board interaction also hides it. See Pro plans navigates to Students but sign-in/payments are disabled. Permanent dismissal and seven-day frequency apply to this browser. Use only fictional data: this preview stores its board locally.

Automated tests cover transition-handler ordering, exact Undo restoration, repeated Clear, eligibility, preference/storage suppression, stale completion cancellation, hidden tabs, privacy allowlisting and existing billing/plan selection. Rendered animation, keyboard and responsive screenshot verification remain outstanding because browser tooling was unavailable during preparation.
