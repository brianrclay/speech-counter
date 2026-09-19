// Regenerates the screenshots in concepts/shots/.
//
// Every image in the concept pages is a capture of the app actually running,
// so the mockups can never drift into showing a UI that does not exist. This
// script seeds a demo roster into local storage, drives the real pages, and
// crops to named elements.
//
//   npm run build
//   node scripts/dev-server.js &
//   node concepts/capture.js
//
// Playwright is not a dependency of the app - it is only needed to refresh
// these images, so install it ad hoc:
//
//   npm i --no-save playwright
//
// Chromium is expected at PW_CHROMIUM (or Playwright's own download).

const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'shots');
const BASE = process.env.CONCEPTS_BASE || 'http://localhost:8743';
const EXECUTABLE = process.env.PW_CHROMIUM || undefined;

// Invented students. Nothing in concepts/ is real caseload data.
const NAMES = ['Ava Mitchell', 'Noah Barnes', 'Mia Fletcher', 'Liam Okafor', 'Sofia Reyes', 'Ethan Park'];
const TARGETS = ['/s/ initial', '/r/ blends', '/th/ medial', '/l/ final', '/s/ initial', '/k/ initial'];
const DAY = 86400000;

function seedData() {
    const now = Date.now();
    const students = NAMES.map((name, i) => ({
        id: 'demo-student-' + i,
        name,
        nameKey: name.toLowerCase(),
        createdAt: now - (30 - i) * DAY,
        updatedAt: now - i * 3600000,
        deletedAt: null,
    }));

    const sessions = [];
    students.forEach((student, si) => {
        // The first student carries a longer history so the summary tiles
        // show a caseload that has been running a while.
        const count = si === 0 ? 6 : 3;
        for (let k = 0; k < count; k++) {
            const at = now - (count - k) * 3.5 * DAY - si * 3600000;
            sessions.push({
                id: 'demo-session-' + si + '-' + k,
                studentId: student.id,
                target: TARGETS[(si + k) % TARGETS.length],
                correct: 8 + ((si + k) % 9) + k * 2,
                incorrect: Math.max(1, 7 - k),
                startedAt: at,
                createdAt: at,
                updatedAt: at,
                deletedAt: null,
            });
        }
    });

    const board = [
        { sessionId: 'demo-board-1', name: 'Ava Mitchell', target: '/s/ initial', correct: 17, incorrect: 3 },
        { sessionId: 'demo-board-2', name: 'Noah Barnes', target: '/r/ blends', correct: 12, incorrect: 6 },
        { sessionId: 'demo-board-3', name: 'Mia Fletcher', target: '/th/ medial', correct: 9, incorrect: 2 },
    ];

    return { students, sessions, board };
}

// Pretend the purchase already happened, so the pages being captured are the
// paid ones rather than the paywall.
function installSeed(data) {
    try {
        localStorage.setItem('speech-counter:entitlement:v1', JSON.stringify({ active: true, source: 'concept-capture', checkedAt: Date.now() }));
        localStorage.setItem('speech-counter:students:v1', JSON.stringify(data.students));
        localStorage.setItem('speech-counter:sessions:v1', JSON.stringify(data.sessions));
        localStorage.setItem('speech-counter-state-v1', JSON.stringify(data.board));
        localStorage.setItem('speech-counter:analytics', 'off');
    } catch (err) {
        // Private browsing or a full disk: the capture still runs, it just
        // shows empty states, which the caller will notice in the output.
    }
}

async function boxOf(page, selector, pad) {
    const box = await page.locator(selector).boundingBox();
    return {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2,
    };
}

async function capture(browser, scheme) {
    // Dark captures get a -dark suffix; the pages choose between the pair
    // with <picture> and a prefers-color-scheme source.
    const suffix = scheme === 'dark' ? '-dark' : '';
    const file = (name) => path.join(OUT, name + suffix + '.png');

    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: scheme,
        isMobile: true,
        hasTouch: true,
    });
    await context.addInitScript(installSeed, seedData());
    const page = await context.newPage();

    // Board: the whole screen, then one row on its own.
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: file('screen-board') });
    await page.locator('.row:not(.template)').first().screenshot({ path: file('f-autosave') });

    // Name suggestions, which only exist while the field has focus and text.
    const name = page.locator('.row:not(.template)').nth(1).locator('.name-fields input').first();
    await name.click();
    await name.fill('');
    await name.type('M', { delay: 100 });
    await page.waitForTimeout(600);
    const row = await page.locator('.row:not(.template)').nth(1).boundingBox();
    const menu = await page.locator('.name-suggestions').boundingBox();
    const left = Math.max(0, Math.min(row.x, menu.x) - 6);
    const top = Math.max(0, row.y - 6);
    await page.screenshot({
        path: file('f-names'),
        clip: {
            x: left,
            y: top,
            width: Math.max(row.x + row.width, menu.x + menu.width) - left + 6,
            height: Math.max(row.y + row.height, menu.y + menu.height) - top + 6,
        },
    });

    // Roster, then one student's record.
    await page.goto(BASE + '/students.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: file('screen-roster') });
    await page.screenshot({ path: file('f-roster'), clip: Object.assign(await boxOf(page, '#student-list', 6), { height: 300 }) });

    await page.locator('#student-list > *').first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: file('screen-detail') });
    const summary = await page.locator('.summary').boundingBox();
    await page.screenshot({
        path: file('f-progress'),
        clip: { x: summary.x - 6, y: summary.y - 6, width: summary.width + 12, height: 300 },
    });

    // The account card, forced into its signed-in state. Signing in for real
    // would need a live backend and a code from an inbox.
    await page.goto(BASE + '/account.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
        const details = document.getElementById('account-details');
        if (details) details.hidden = false;
        const email = document.getElementById('account-email');
        if (email) email.textContent = 'you@school.org';
        const status = document.getElementById('account-sync-status');
        if (status) status.textContent = 'Synced just now';
        ['account-promo', 'account-signed-out'].forEach((id) => {
            const node = document.getElementById(id);
            if (node) node.hidden = true;
        });
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: file('f-sync'), clip: await boxOf(page, '#account-details', 8) });

    await captureExport(context, scheme, file);
    await context.close();
}

// The CSV export is a file download with no screen of its own, so this runs
// the app's own exportCSV() and renders the rows it returns as a spreadsheet.
// The columns and the numbers are the real output.
async function captureExport(context, scheme, file) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 760, height: 420 });
    await page.goto(BASE + '/students.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const csv = await page.evaluate(() => window.SpeechStore.exportCSV());
    const table = await page.evaluate((text) => {
        const lines = text.replace(/^﻿/, '').trim().split('\r\n').slice(0, 9);
        return lines.map((line, i) => {
            // Only the leading columns fit legibly at this width; the
            // timestamps and ids that follow are cropped off.
            const cells = line.split(',').slice(0, 6);
            const tag = i === 0 ? 'th' : 'td';
            const gutter = i === 0 ? '<th class="rn"></th>' : `<td class="rn">${i}</td>`;
            const body = cells.map((cell, j) => `<${tag} class="c${j}">${cell.replace(/^"|"$/g, '')}</${tag}>`).join('');
            return `<tr>${gutter}${body}</tr>`;
        }).join('');
    }, csv);

    const stamp = new Date().toISOString().slice(0, 10);
    await page.setContent(`<!doctype html><html><head><meta name="color-scheme" content="light dark"><style>
:root { --bg:#faf9fc; --sheet:#ffffff; --grid:#e3e0ea; --head:#f1eefa; --text:#1c1b24; --muted:#6f6a80; --accent:#6448d6; --ok:#0b7f5e; --no:#b83a1f; }
@media (prefers-color-scheme: dark) { :root { --bg:#150d1c; --sheet:#1f1529; --grid:#342844; --head:#2e2040; --text:#ffffff; --muted:#a99bc4; --accent:#f2a9da; --ok:#0ea57a; --no:#e86a4d; } }
* { box-sizing: border-box; }
body { margin:0; padding:18px; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; }
.wrap { background:var(--sheet); border:1px solid var(--grid); border-radius:10px; overflow:hidden; box-shadow:0 6px 18px rgba(0,0,0,.07); }
.bar { display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid var(--grid); background:var(--head); font-size:13px; font-weight:600; color:var(--accent); }
.bar .dot { width:9px; height:9px; border-radius:50%; background:var(--accent); opacity:.55; }
table { border-collapse:collapse; width:100%; font-size:12.5px; }
th, td { border-right:1px solid var(--grid); border-bottom:1px solid var(--grid); padding:7px 10px; text-align:left; white-space:nowrap; }
tr:first-child th { background:var(--head); font-weight:700; color:var(--text); }
td.rn, th.rn { background:var(--head); color:var(--muted); width:30px; text-align:center; font-weight:600; }
td.c2 { color:var(--ok); font-weight:700; }
td.c3 { color:var(--no); font-weight:700; }
td.c5 { font-weight:700; }
tr:last-child td { border-bottom:none; }
</style></head><body><div class="wrap"><div class="bar"><span class="dot"></span>speech-count-${stamp}.csv</div><table><tbody>${table}</tbody></table></div></body></html>`);
    await page.waitForTimeout(400);
    const box = await page.locator('.wrap').boundingBox();
    await page.screenshot({
        path: file('f-export'),
        clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 },
    });
    await page.close();
}

(async () => {
    let chromium;
    try {
        ({ chromium } = require('playwright'));
    } catch (err) {
        console.error('Playwright is not installed. Run: npm i --no-save playwright');
        process.exit(1);
    }

    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
    try {
        for (const scheme of ['light', 'dark']) {
            await capture(browser, scheme);
            console.log('captured ' + scheme);
        }
    } finally {
        await browser.close();
    }
    console.log('Wrote screenshots to ' + OUT);
})();
