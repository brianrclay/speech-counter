# Review baseline

Based on GitHub master 7326336c856f85f251e7726b1c53a4384ad23293.
The current production frontend was manually released and is ahead of GitHub master.
This baseline contains only frontend dependencies required by the post-Clear candidate and its isolated tests, copied from the existing reviewed checkout.
No backend migrations, functions, credentials, customer records, native app assets, metrics dashboard or Page changes are included.
The next commit contains the post-Clear suggestion separately. The review build replaces billing/account/sync/analytics with local-only mocks and has no functions.
