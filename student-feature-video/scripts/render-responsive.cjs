const { bundle } = require("@remotion/bundler");
const {
  selectComposition,
  renderStill,
  renderMedia,
  openBrowser,
} = require("@remotion/renderer");
const path = require("path");
const fs = require("fs");
(async () => {
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/index.ts"),
    outDir: path.resolve("out/responsive-bundle"),
    rspack: true,
  });
  const browser = await openBrowser("chrome", {
    browserExecutable:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    for (const variant of ["mobile", "desktop"]) {
      const id =
        variant === "mobile"
          ? "StudentFeaturesMobile"
          : "StudentFeaturesDesktop";
      const composition = await selectComposition({
        serveUrl,
        id,
        puppeteerInstance: browser,
      });
      fs.mkdirSync(`out/${variant}`, { recursive: true });
      if (process.argv.includes("--video")) {
        let last = -1;
        await renderMedia({
          serveUrl,
          composition,
          puppeteerInstance: browser,
          codec: "h264",
          outputLocation: path.resolve(
            `out/student-features-${variant}-v5.mp4`,
          ),
          crf: 18,
          pixelFormat: "yuv420p",
          concurrency: 3,
          onProgress: ({ progress }) => {
            const p = Math.floor(progress * 10) * 10;
            if (p !== last) {
              last = p;
              console.log(`${variant}: ${p}%`);
            }
          },
        });
      } else {
        const requested = process.argv
          .slice(2)
          .map(Number)
          .filter(Number.isFinite);
        for (const frame of requested.length
          ? requested
          : [45, 150, 185, 305, 435, 615, 681, 790, 858, 980]) {
          await renderStill({
            serveUrl,
            composition,
            frame,
            output: path.resolve(`out/${variant}/${frame}.png`),
            scale: 0.5,
            puppeteerInstance: browser,
          });
          console.log(`${variant}: frame ${frame}`);
        }
      }
    }
  } finally {
    await browser.close({ silent: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
