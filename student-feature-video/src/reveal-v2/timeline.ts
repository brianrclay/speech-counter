export const chapters = [
  {
    start: 0,
    end: 90,
    label: "SPEECH COUNT",
    lines: ["More time for students.", "Less time tracking."],
    kind: "hook",
  },
  {
    start: 90,
    end: 240,
    label: "YOUR STUDENTS",
    lines: ["Your students.", "Ready for every session."],
    kind: "save",
  },
  {
    start: 240,
    end: 390,
    label: "AUTOMATIC SESSION HISTORY",
    lines: ["Count.", "It’s saved."],
    kind: "auto",
  },
  {
    start: 390,
    end: 570,
    label: "STUDENT SESSIONS",
    lines: ["Every session.", "One place."],
    kind: "history",
  },
  {
    start: 570,
    end: 750,
    label: "ACROSS YOUR DEVICES",
    lines: ["Pick up where", "you left off."],
    kind: "sync",
  },
  {
    start: 750,
    end: 900,
    label: "CSV EXPORT",
    lines: ["Your data,", "ready to use."],
    kind: "export",
  },
  {
    start: 900,
    end: 1020,
    label: "SPEECH COUNT",
    lines: ["Keep your focus", "on progress."],
    kind: "close",
  },
] as const;

// Each change below corresponds to a captured action in the unchanged app.
export const screens = [
  { at: 0, file: "09-tally-16" },
  { at: 33, file: "10-tally-17" },
  { at: 62, file: "11-tally-18" },
  { at: 90, file: "01-roster-empty", fade: 6 },
  { at: 125, file: "02-add-form" },
  // Actual form captures: one additional character per keystroke.
  ...[144, 148, 151, 155, 159, 165, 168, 171, 175, 179, 182, 185].map(
    (at, i) => ({ at, file: `typing-${String(i + 1).padStart(2, "0")}` }),
  ),
  { at: 203, file: "05-student-saved" },
  { at: 240, file: "09-tally-16", fade: 6 },
  { at: 285, file: "10-tally-17" },
  { at: 315, file: "11-tally-18" },
  { at: 357, file: "12-session-saved-list", fade: 4 },
  { at: 376, file: "13-session-persisted", fade: 4 },
  { at: 398, file: "14-history", fade: 5 },
  ...Array.from({ length: 24 }, (_, i) => ({
    at: 447 + i,
    file: `scroll-${String(i).padStart(2, "0")}`,
  })),
  ...Array.from({ length: 24 }, (_, i) => ({
    at: 483 + i,
    file: `scroll-${String(23 - i).padStart(2, "0")}`,
  })),
  { at: 507, file: "14-history" },
  { at: 524, file: "15-session-edit" },
  { at: 558, file: "14-history" },
  { at: 750, file: "16-export-roster", fade: 5 },
  { at: 795, file: "17-export-after" },
  { at: 922, file: "14-history", fade: 6 },
];

// [frame, left, top, scale, rotation]. One camera drives the entire physical device.
export const phoneCamera = [
  [0, 163, 630, 1.75, -3],
  [36, 217, 552, 1.56, 0],
  [90, 217, 552, 1.56, 0],
  // One sustained close-up for adding and counting; no reset between features.
  [122, 87, 565, 2.18, 0],
  [333, 87, 565, 2.18, 0],
  [354, 217, 552, 1.56, 0],
  [390, 217, 552, 1.56, 0],
  [420, 84, 470, 2.2, 0],
  [560, 84, 470, 2.2, 0],
  [601, 40, 880, 1.42, 0],
  [714, 40, 880, 1.42, 0],
  [750, 217, 552, 1.56, 0],
  [777, 12, 610, 2.45, 0],
  [802, 12, 610, 2.45, 0],
  [829, 604, 672, 1.27, 3],
  [885, 604, 672, 1.27, 3],
  [938, 278, 570, 1.27, 0],
  [1019, 278, 555, 1.27, 0],
];

// Touch coordinates are measured in the captured 390 × 744 app viewport.
export const touches = [
  { at: 33, x: 244, y: 124 },
  { at: 62, x: 244, y: 124 },
  { at: 125, x: 343, y: 130 },
  { at: 203, x: 262, y: 200 },
  { at: 285, x: 244, y: 124 },
  { at: 315, x: 244, y: 124 },
  { at: 357, x: 195, y: 698 },
  { at: 376, x: 195, y: 201 },
  { at: 524, x: 66, y: 332 },
  { at: 558, x: 153, y: 332 },
  { at: 795, x: 354, y: 46 },
];
