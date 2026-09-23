# Final verification

- H.264 MP4: 1080 × 1920, 30 fps, 34.000 seconds, 1,020 frames, no audio stream.
- Full MP4 decoded successfully with FFmpeg.
- Inspected representative full-size review frames and a one-frame-per-second contact sheet spanning the complete rendered sequence.
- Verified name entry, Add action and saved roster result, 16 → 17 → 18 correct counts, saved session after navigation, scrolling, inline editor, two-device matching records, Export tap, and CSV data.
- Inspected device clipping, camera-cutout clearance, fixed frame/screen transforms, camera holds, and transitions.
- No production files were modified by this video work. Only fictional Maya Bennett data appears.
- ESLint and TypeScript checks passed for the revised composition.
- Source screenshots, downloaded CSV, and local sync exchange proof are retained under public/demo/.

## Revision v3

- Export: out/speech-count-student-features-v3.mp4; H.264, 1080 × 1920, 30 fps, 34 seconds. Full decode passes.
- Spring-driven camera motion checked at pose transitions. The 3–11 second section is now one sustained close-up; removed the intermediate pullback and second push-in.
- All twelve name prefixes are real form captures; inspected the rendered typing sequence around 5 seconds.
- iPad captures use an unstretched 768 × 1024 screen with equal 20-pixel case padding.
- Replaced CanvasImage with Remotion Img throughout the active composition.
- Flicker regression compared every frame of the static 28–29.5 second hold: six blank phone-screen frames in the previous file (842, 850, 858, 866, 870, 874), zero in v3. Visually inspected the remainder of the 28–30 second transition.
- TypeScript and ESLint pass. Per-frame results saved in out/review/flicker-regression.json.
