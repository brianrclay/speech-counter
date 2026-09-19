# Student paywall concepts

Three design concepts for the Students screen a user sees *before* they buy
Speech Count Pro. Today that screen is a hero, the plans, and a plain bulleted
feature list; these all replace the list with pictures of the features.

Open `concepts/index.html` in a browser (phone-width window) to compare them.
Each page is a static mockup: it loads the app's real `css/reset.css` and
`css/style.css` so the concepts are judged in the app's own type, colour and
spacing, and adds only the CSS its own layout needs. Nothing here is wired to
billing, and nothing here is copied into `www/` by `npm run build`.

## The concepts

| | Page | Idea | Page height at 390px |
|---|---|---|---|
| A | `paywall-a-deck.html` | Swipe deck: five numbered cards in a horizontal snap-scroller above the plans | ~1020px |
| B | `paywall-b-strips.html` | Feature strips: one screenshot per claim, stacked, with a sticky purchase bar | ~2890px |
| C | `paywall-c-beforeafter.html` | Before and after: one hero showing a board row becoming a student record | ~1680px |

## Screenshots

`shots/` holds the imagery. Every file is a capture of the app actually
running, taken at a 390x844 viewport at 2x, in both colour schemes. Files
ending `-dark` are the dark-scheme capture, and each page picks between them
with `<picture>` and a `prefers-color-scheme` source, so the screenshots follow
the app's theme instead of sitting bright on a dark page.

| File | What it shows |
|---|---|
| `f-autosave` | A single board row mid-tally |
| `f-progress` | A student's sessions, trials and percent correct |
| `f-roster` | The student list with per-student percentages |
| `f-names` | The name field suggesting students from the roster |
| `f-export` | The real CSV export, rendered as a spreadsheet |
| `f-sync` | The account card showing a signed-in, synced device |
| `screen-*` | Whole-screen captures of the board, roster and detail views |

The demo roster (Ava Mitchell, Noah Barnes and so on) is invented data seeded
into local storage before each capture. No real student data is in this folder.

`f-export` is the one composed image: it runs the app's own `exportCSV()` over
that seeded roster and renders the returned rows as a spreadsheet, because the
export itself is a file download with no screen of its own. The columns and
values are the real output.

## Regenerating the screenshots

`capture.js` rebuilds everything in `shots/`. It seeds a demo roster into local
storage, drives the real pages, and crops to named elements, so a concept can
never drift into showing a UI that does not exist. Playwright is not a
dependency of the app, so install it only when refreshing the images:

```
npm run build
node scripts/dev-server.js &
npm i --no-save playwright
node concepts/capture.js
```

Set `PW_CHROMIUM` if Chromium lives somewhere Playwright will not find on its
own, and `CONCEPTS_BASE` if the dev server is not on port 8743.
