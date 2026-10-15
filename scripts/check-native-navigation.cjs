const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { prepareNativeLinks } = require('./native-links.cjs');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-native-links-'));
try {
    for (const page of ['index', 'students', 'account', 'privacy']) fs.writeFileSync(path.join(fixture, `${page}.html`), '');
    fs.writeFileSync(path.join(fixture, 'index.html'), `<a href='/students'>Students</a><a href="/account?plan=pro#details">Account</a><a href='/'>Board</a><a href='/privacy/'>Privacy</a><a href='https://speechcount.com/support'>Support</a><a href='#sheet'>Open</a><a href='/assets/icon.svg'>Icon</a>`);
    prepareNativeLinks(fixture);
    const output = fs.readFileSync(path.join(fixture, 'index.html'), 'utf8');
    for (const href of ['./students.html', './account.html?plan=pro#details', './index.html', './privacy.html', 'https://speechcount.com/support', '#sheet', '/assets/icon.svg']) assert.ok(output.includes(href), href);
    prepareNativeLinks(fixture);
    assert.equal(fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'), output);
} finally { fs.rmSync(fixture, { recursive: true }); }

// Check the actual release assets when provided, rather than just source HTML.
if (process.argv[2]) {
    const directory = path.resolve(process.argv[2]);
    for (const page of ['index', 'students', 'account']) {
        const html = fs.readFileSync(path.join(directory, `${page}.html`), 'utf8');
        const nav = html.match(/<nav\b[^>]*class=["']tab-bar["'][\s\S]*?<\/nav>/)[0];
        const hrefs = [...nav.matchAll(/\bhref=["']([^"']+)["']/g)].map(match => match[1]);
        assert.equal(hrefs.length, 3);
        for (const target of ['index', 'students', 'account']) assert.ok(hrefs.includes(`./${target}.html`), `${page} -> ${target}`);
        for (const href of hrefs) assert.ok(fs.existsSync(path.join(directory, href)), href);
    }
}
console.log('PASS native tab destinations resolve to the bundled Students, Account, and Board pages');
