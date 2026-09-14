// Copies the static site into www/, which is what Capacitor's webDir
// points at. There's no bundler here on purpose - this app is plain
// HTML/CSS/JS and stays that way; this script just assembles the same
// files Capacitor needs to hand to the native iOS/Android shells.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'www');

const entries = ['index.html', 'students.html', 'privacy.html', 'support.html', 'main.js', 'store.js', 'students.js', 'css', 'assets'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
    const src = path.join(root, entry);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(outDir, entry), { recursive: true });
}

console.log(`Built www/ from: ${entries.join(', ')}`);
