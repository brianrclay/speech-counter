# Speech Count 1.1 App Review audit

Reviewed September 22, 2026.

## Code and deployment

- Require verified email sign-in before native purchase or restore; identify the RevenueCat account before opening StoreKit.
- Prevent duplicate checkout, purchase after account changes, and purchase continuation after dismissing sign-in.
- Keep Restore purchases for recovery of App Store transactions.
- Allow immediate account deletion after a recurring-billing warning. Remove the account email, email index, sign-in code and synced roster; retain a minimal revocation record. Deletion does not cancel store subscriptions.
- Block reactivation during partial deletion; retries finish cleanup. Guard against late sync writes after deletion.
- Update privacy policy and app privacy manifest for accounts, purchase history and synced student/session data. Include the manifest in Xcode's resources.
- Deploy backend and privacy changes to speechcount.com.

## Validation

- 15 tests in tests/: purchase identity, existing entitlement recovery, cancellation, concurrent checkout, dismissed verification, account deletion and retry behavior.
- 21 checks in scripts/checks.cjs: authentication, code consumption, token revocation, sync conflicts/paging and deletion racing an in-flight write, local account separation, data cleanup, export and performance.
- Production reviewer login returned a valid session; privacy/support/terms pages returned HTTP 200.
- Preview rejected unauthenticated deletion and sync with HTTP 401 and allowed capacitor://localhost CORS.
- iOS 1.1 build 7 archived and uploaded successfully. Verified code signature and presence of the app privacy manifest in the archive.
- Device purchase flow tested by owner in TestFlight before this audit. New account-deletion behavior verified in isolated automated tests; no live customer accounts deleted.

## App Store Connect

- Created version 1.1 and replaced obsolete offline-only listing and review notes.
- Saved dedicated reviewer credentials with owner's explicit permission.
- Published privacy disclosures for name, email, health/session information, other user content, account ID and purchase history; preserved unlinked analytics categories.
- Added lifetime purchase and monthly subscription to the draft review package.

## Submission confirmed

Submitted September 22, 2026 at 2:24 PM America/Denver. All four items show **Waiting for Review**:

- iOS App 1.1 (7), build ID 81494262-c17e-4c9c-b33a-a6a6f0805cd9
- Roster Lifetime
- Roster Monthly
- Roster subscription group

Submission ID: 77d0e73d-5e4a-48b5-b209-9799aa9f4e02

https://appstoreconnect.apple.com/apps/6812056789/distribution/reviewsubmissions/details/77d0e73d-5e4a-48b5-b209-9799aa9f4e02

Existing automatic release after approval setting preserved. Dedicated reviewer sign-in is verified. After explicit owner approval, granted three months of complimentary Roster/Pro access to the dedicated review account on September 22, 2026. Verified that account's production sync endpoint returned HTTP 200. Apple can test in-app purchases through its review sandbox using an account without an existing entitlement. No customer purchases or accounts were removed.
