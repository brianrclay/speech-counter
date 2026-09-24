# Feature video analytics

The shared player sends these events through `SpeechBilling.track` and the existing `SpeechAnalytics` GA allowlist (measurement ID `G-QPE28RCTSV`).

| Event | User action |
| --- | --- |
| `video_open` | Click the Board tour card or Students hero video button |
| `video_control` | Tap/keyboard play, pause or replay; toggle mute; finish seeking; explicitly close the dialog |
| `video_plan_select` | Click a plan or change it with arrow keys inside the video dialog |
| `video_cta_click` | Click the purchase/subscribe CTA inside the video dialog |
| `video_dismiss` | Permanently dismiss the Board tour card |

Parameters are restricted to known values: `video_id=student_features`, `source=board|students`, `video_variant=mobile|desktop`, and `platform`. Controls additionally carry `video_action=play|pause|replay|mute|unmute|seek|close`; plan and purchase clicks carry `item_id=lifetime|monthly`. The existing billing helper retains experiment assignment when available.

`video_cta_click` is a video-specific intent event, not a purchase confirmation. Existing `paywall_cta_click` still fires once for the same purchase click; do not sum these two event counts as separate purchases. Students captures the video context before restoring its sticky dock. Clicking that dock outside the dialog does not emit video events.

Autoplay, price loading, initial/default plan selection, visibility pauses, and programmatic dialog restoration do not create click events. Seek records the committed change rather than every input tick. No student names, IDs, account details, URLs, or free text are included in these events.

Tracking stays disabled on preview/local/native origins and when the user opts out. The GA allowlist also rejects unknown parameter values. No GA Admin reporting configuration or production ingestion was verified as part of this change; events will be sent by the production web build after deployment.

Validation: exercised the real player and analytics scripts against both HTML pages in an isolated DOM with production-origin configuration and no external script loading. Verified both video variants, each control action, selected-plan attribution, one video CTA and one general paywall CTA per purchase click, no attribution outside the dialog, and suppression on preview origins or opt-out. Existing plan experiment checks, JavaScript syntax checks, and static build also pass.
