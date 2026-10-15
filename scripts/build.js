// Copies the static site into www/, which is what Capacitor's webDir
// points at. There's no bundler here on purpose - this app is plain
// HTML/CSS/JS and stays that way; this script just assembles the same
// files Capacitor needs to hand to the native iOS/Android shells.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'www');

const entries = ['index.html', 'students.html', 'account.html', 'demo.html', 'demo.js', 'privacy.html', 'support.html', 'terms.html', 'analytics.js', 'main.js', 'feature-video.js', 'students.js', 'student-history.js', 'account-page.js', 'sheet.js', 'store.js', 'billing.js', 'account.js', 'sync.js', 'swipe.js', 'css', 'assets'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
    const src = path.join(root, entry);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(outDir, entry), { recursive: true });
}

require('./native-links.cjs').prepareNativeLinks(outDir);

// Bundle the pinned SDK locally for both web and the offline Capacitor shell.
const posthogVersion = require('posthog-js/package.json').version;
fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });
fs.copyFileSync(require.resolve('posthog-js/dist/array.no-external.js'), path.join(outDir, 'vendor', `posthog-${posthogVersion}.js`));

// Keep the previous video source for reference without shipping both versions.
for (const name of ['student-features.mp4', 'student-features.jpg']) {
    fs.rmSync(path.join(outDir, 'assets', 'video', name), { force: true });
}

console.log(`Built www/ from: ${entries.join(', ')}`);
