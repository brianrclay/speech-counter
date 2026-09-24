# Speech Count — Student Features

Responsive feature reveal: **1080 × 1440 (3:4) phone** and **1920 × 1080 (16:9) desktop**, both **30 fps**, **34 seconds**, with instrumental music.

The compact phone composition is designed for the usable player area on a 393px-wide phone, after browser chrome, the video controls, and pricing. It deliberately does not match the full display aspect ratio. Desktop has its own side-by-side typography, camera framing, and device arrangement.

## Deliverables

- Phone video: `out/student-features-mobile-v5.mp4`
- Desktop video: `out/student-features-desktop-v5.mp4`
- Responsive compositions: `src/responsive/Reveal.tsx`
- Shipped MP4s and posters: `../assets/video/student-features-{mobile,desktop}-v5.*`
- Previous portrait video retained: `out/speech-count-student-features-v4.mp4`
- Editable composition: `src/reveal-v2/Reveal.tsx`
- Copy, shot changes, camera keyframes, and touch timing: `src/reveal-v2/timeline.ts`
- Device frames and clipping: `src/reveal-v2/Device.tsx`
- Headline and CSV treatments: `src/reveal-v2/Overlays.tsx`
- Verified storyboard: `STORYBOARD.md`
- Original downloaded CSV: `public/demo/speech-count-2026-09-22.csv`

Use Node 20 or newer. Run `npm install`, then `npx remotion studio --no-open` and select **StudentFeaturesMobile** or **StudentFeaturesDesktop**. **StudentFeatureReveal** remains available as the original 9:16 version. The old treatment remains in `src/Composition-v1.tsx` and `src/scenes/` for reference, but is not registered as the current composition.

## UI sources and capture method

All visible app content is captured from this repository's actual `index.html`, `students.html`, `main.js`, `students.js`, `store.js`, `sync.js`, and shared CSS. No application screen, button, save badge, or feature was redrawn. The app icon and Inter fonts come from `assets/`. The iPhone/tablet housings, touch indicators, and separate CSV preview are editorial graphics.

Captures were made at 390 × 744 for the phone's app viewport and 768 × 1024 for the 4:3 iPad screen. The screen has a separate top system area so the camera cutout never covers app controls. The entire phone, its captured screen, and touch indicators share one frame-driven transform.

A fictional **Maya Bennett** connects the workflow: add a student, count responses, navigate to the saved session, review dated history, open the actual inline editor, see the same synced records on a second device, and export.

`scripts/demo-server.cjs` serves the production app files unchanged from disk, with an isolated test host, deterministic clock, fictional cached account/Pro entitlement, and a local sync fixture. It does not edit application production files. All external requests are blocked by the filming host's CSP. The two device origins use separate local storage and share only the fixture endpoint through the app's real sync client. `public/demo/sync-proof.json` records those exchanges.

The CSV was obtained by clicking the real Export button. `scripts/prepare-csv.cjs` validates it and creates the data consumed by the editorial file preview. The preview shows selected columns, with dates shortened to their ISO calendar date. Values are copied from the CSV, including the app's rounding behavior.

The product URL **speechcount.com** is verified in `account.js` and `netlify.toml`.

## Limitations

- The account and sync backend are local filming fixtures. Production login, payment, and cloud service availability were not tested or depicted as verified. The real sync client and matching records on two separate device origins were exercised.
- Session history supports inline editing, not a separate session detail page; the video shows that real editor.
- This is captured browser UI in device framing, not native iOS screen recording. No iOS keyboard or share sheet is fabricated.
- Soundtrack: “Close Up” by Michael Ramir C., under the Mixkit Stock Music Free License. See `public/audio/LICENSE.md`. No voiceover.
- Only fictional records appear. No real student information was used.

## Rendering and verification

```sh
node scripts/render-responsive.cjs
node scripts/render-responsive.cjs --video
```

The helper uses the locally installed Chrome executable on this Mac. Review frames are saved under `out/mobile/` and `out/desktop/`. For another computer, update the browser path or use standard Remotion rendering:

```sh
npx remotion render StudentFeaturesMobile out/student-features-mobile-v5.mp4 --codec=h264 --crf=18
npx remotion render StudentFeaturesDesktop out/student-features-desktop-v5.mp4 --codec=h264 --crf=18
```

## Motion revision (v3)

- Camera moves use a lightly damped spring with gentle settling. The 3–11 second section holds one close-up across Add and Count, followed by one pullback for navigation.
- Name entry uses 12 actual form captures, one per character, between 4.8 and 6.17 seconds.
- iPad content is recaptured at 768 × 1024 and displayed without stretching inside an evenly padded 4:3 screen frame.
- App screenshots use Remotion Img image-load synchronization, replacing CanvasImage after blank screen frames were confirmed in the prior MP4.
- The preceding export remains available as speech-count-student-features.mp4 for comparison.

## Responsive integration (v5)

The app chooses the desktop video at viewport widths of 900px and above, and the phone video below that. Selection happens each time the dialog opens; resizing during playback does not interrupt the current video. Both versions start muted. The landing poster uses the same breakpoint. Versioned filenames avoid the immutable asset cache serving the old video.

Validation: Remotion ESLint/TypeScript passed; both MP4s decode fully as H.264/AAC with 1,020 video frames. Reviewed every feature, typing, iPad sync, CSV and closing transition in both layouts. The exposed phone UI remains present in all 45 frames of the 28–29.5s CSV hold in each render. Browser checks covered Board and Students at 393×700, full phone height 393×852, and desktop 1440×900: correct source/poster, muted start, tap pause, sound toggle, pricing visibility and navigation overlap. These are browser viewport checks, not a claim of testing on physical iPhone hardware.
