/**
 * Public roadmap content — tasks, axis labels, milestones.
 * Edit here when shipping features or adjusting the timeline.
 */

/** @typedef {'done' | 'active' | 'todo' | 'future'} RoadmapTaskStatus */

/**
 * @typedef {Object} RoadmapTaskGridDef
 * @property {string} label
 * @property {number} startGrid — inclusive month-line index (0–35)
 * @property {number} endGrid — exclusive month-line index (1–36)
 * @property {number} [lane] — required for done/active; todo/future lanes are auto-packed
 * @property {RoadmapTaskStatus} status
 */

/** @type {readonly { label: string, span: number }[]} */
export const ROADMAP_YEARS = [
  { label: '2025', span: 3 },
  { label: '2026', span: 4 },
  { label: '2027', span: 2 },
];

/** @type {readonly string[]} */
export const ROADMAP_QUARTERS = [
  'Dev',
  "Q3 '25",
  "Q4 '25",
  "Q1 '26",
  'Q2 2026',
  "Q3 '26",
  "Q4 '26",
  "Q1 '27",
  "Q2 '27",
];

/** Grid index for the start of Q2 2026 (quarter boundary). */
export const ROADMAP_Q2_2026_START_GRID = 16;

/** Grid index for public launch — mid Q2 2026 (~2 months into the quarter). */
export const ROADMAP_LAUNCH_GRID = 18;

/** @type {{ label: string, grid: number }} */
export const ROADMAP_LAUNCH_MILESTONE = {
  label: 'Launch',
  grid: ROADMAP_LAUNCH_GRID,
};

/**
 * Shipped work + what's next — aligned to the month grid.
 * Same-lane bars never overlap; different lanes may run in parallel.
 * Todo/future omit lane — they pack into the topmost free row.
 * Short tasks need at least 2 grid units so 54px pills stay inside quarter lines.
 * @type {readonly RoadmapTaskGridDef[]}
 */
export const ROADMAP_TASK_GRID_DEFS = [
  /* Q2 2025 — Dev (grid 0–4) */
  { label: 'Import & viewport', startGrid: 0, endGrid: 3, lane: 0, status: 'done' },
  { label: 'Format loaders', startGrid: 1, endGrid: 4, lane: 1, status: 'done' },

  /* Q3 2025 (grid 4–8) */
  { label: 'HDR lighting', startGrid: 4, endGrid: 7, lane: 0, status: 'done' },
  { label: 'Post FX stack', startGrid: 5, endGrid: 8, lane: 2, status: 'done' },
  { label: 'Export stills', startGrid: 6, endGrid: 8, lane: 1, status: 'done' },
  { label: 'Export MP4', startGrid: 6, endGrid: 8, lane: 3, status: 'done' },

  /* Q4 2025 (grid 8–12) */
  { label: 'Display modes', startGrid: 8, endGrid: 11, lane: 0, status: 'done' },
  { label: 'Gamepad support', startGrid: 8, endGrid: 10, lane: 3, status: 'done' },
  { label: 'Animation scrub', startGrid: 9, endGrid: 12, lane: 2, status: 'done' },
  { label: 'Scene JSON', startGrid: 10, endGrid: 12, lane: 1, status: 'done' },
  { label: 'Wireframe & UV', startGrid: 11, endGrid: 13, lane: 3, status: 'done' },

  /* Q1 2026 (grid 12–16) */
  { label: 'Look filters', startGrid: 12, endGrid: 15, lane: 1, status: 'done' },
  { label: 'Custom HDRI', startGrid: 12, endGrid: 14, lane: 0, status: 'done' },
  { label: 'Landing page', startGrid: 13, endGrid: 18, lane: 4, status: 'active' },
  { label: 'Isometric cam', startGrid: 13, endGrid: 16, lane: 3, status: 'active' },
  { label: 'Spotlight gobos', startGrid: 14, endGrid: 16, lane: 2, status: 'active' },
  { label: 'Histogram', startGrid: 12, endGrid: 14, lane: 2, status: 'done' },

  /* Q2 2026 — launch quarter (grid 16–20) */
  { label: 'Stability & QA', startGrid: 16, endGrid: 20, lane: 0, status: 'active' },
  { label: 'ColorChecker', startGrid: 16, endGrid: 18, lane: 1, status: 'done' },
  { label: 'Lens effects', startGrid: 18, endGrid: 20, lane: 1, status: 'done' },
  { label: 'Presskit', startGrid: 16, endGrid: 18, status: 'todo' },

  /* Q3 2026 (grid 20–24) */
  { label: 'Scene sharing', startGrid: 20, endGrid: 23, status: 'todo' },
  { label: 'Batch export', startGrid: 21, endGrid: 24, status: 'todo' },
  { label: 'Performance pass', startGrid: 16, endGrid: 28, lane: 2, status: 'active' },

  /* Q4 2026 (grid 24–28) */
  { label: 'Collaboration', startGrid: 24, endGrid: 27, status: 'future' },
  { label: 'Plugin API', startGrid: 25, endGrid: 29, status: 'future' },
  { label: 'Shader Lab+', startGrid: 24, endGrid: 26, status: 'future' },

  /* Q1 2027 (grid 28–32) */
  { label: 'Mobile preview', startGrid: 28, endGrid: 31, status: 'future' },
  { label: 'Offline PWA', startGrid: 29, endGrid: 32, status: 'future' },

  /* Q2 2027 (grid 32–36) */
  { label: 'OUTLINER', startGrid: 32, endGrid: 36, status: 'future' },
];
