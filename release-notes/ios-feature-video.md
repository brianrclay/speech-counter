# Student feature video in iOS

The student-feature video is bundled with the Capacitor app. It does not stream from the website and can play without a network connection. Pricing and account actions still require their normal network access.

## Prepare the native project

Use Node 22 or newer and Xcode with an installed iOS SDK:

```sh
npm ci
npm run sync:ios
npx cap open ios
```

`sync:ios` builds `www/` and runs `cap sync ios`, copying the video, poster, player code, and current UI styles into `ios/App/App/public`. These generated files are intentionally ignored by Git; repeat sync after changing web assets and before archiving.

The existing Capacitor bridge enables inline media playback. The HTML player uses `playsinline`, starts muted on each open, toggles playback on tap, and exposes an icon-only mute control. The video and price selector share the available viewport above the native tab bar and home indicator. Permanent tour-card dismissal uses Capacitor Preferences on iOS, with local storage as a fallback.

## Before a release

- Confirm the Board card appears on a fresh install and opens the inline player with the pricing selector visible.
- Confirm tapping the video pauses/resumes and the speaker icon toggles sound; reopening starts muted.
- Confirm dismissal survives relaunch and adding a student hides the card.
- Check on a physical iPhone, including background/foreground and an offline playback attempt.
- Choose the next build number before archiving and uploading through the normal release process.

This setup does not change the current App Store submission or upload a new build.

## Setup verification — September 23, 2026

- `npm run sync:ios` completed and discovered all four native plugins.
- Source and bundled MP4 SHA-256 hashes matched.
- Xcode Debug simulator build completed successfully with code signing disabled.
- Installed and launched the build on the iPhone 17 Pro simulator (iOS 26.5).
- Physical-device playback and App Store upload remain release checks.
