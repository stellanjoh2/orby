/**
 * Public roadmap content — tasks, axis labels, milestones.
 * Edit here when shipping features or adjusting the timeline.
 */

/** @typedef {'done' | 'active' | 'todo' | 'future' | 'priority'} RoadmapTaskStatus */

/**
 * @typedef {Object} RoadmapTaskGridDef
 * @property {string} label
 * @property {number} startGrid — inclusive month-line index (0–39)
 * @property {number} endGrid — exclusive month-line index (1–40)
 * @property {RoadmapTaskStatus} status
 */

/** @type {readonly { label: string, span: number }[]} */
export const ROADMAP_YEARS = [
  { label: '2025', span: 3 },
  { label: '2026', span: 4 },
  { label: '2027', span: 3 },
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
  "Q3 '27",
];

/** Grid index for the start of Q2 2026 (quarter boundary). */
export const ROADMAP_Q2_2026_START_GRID = 16;

/** Grid index for the start of Q3 2026 (quarter boundary). */
export const ROADMAP_Q3_2026_START_GRID = 20;

/** Grid index for public launch — start of Q3 2026. */
export const ROADMAP_LAUNCH_GRID = ROADMAP_Q3_2026_START_GRID;

/** @type {{ label: string, grid: number }} */
export const ROADMAP_LAUNCH_MILESTONE = {
  label: 'Launch',
  grid: ROADMAP_LAUNCH_GRID,
};

/**
 * Shipped work + what's next — aligned to the month grid.
 * Lanes are computed automatically from status (see assignRoadmapTaskLanes).
 * Short tasks need at least 2 grid units so 54px pills stay inside quarter lines.
 * @type {readonly RoadmapTaskGridDef[]}
 */
export const ROADMAP_TASK_GRID_DEFS = [
  /* Q2 2025 — Dev (grid 0–4) */
  { label: 'Import & viewport', startGrid: 0, endGrid: 3, status: 'done' },
  { label: 'Format loaders', startGrid: 1, endGrid: 4, status: 'done' },

  /* Q3 2025 (grid 4–8) */
  { label: 'HDR lighting', startGrid: 4, endGrid: 7, status: 'done' },
  { label: 'Post FX stack', startGrid: 5, endGrid: 8, status: 'done' },
  { label: 'Export stills', startGrid: 6, endGrid: 8, status: 'done' },
  { label: 'Export MP4', startGrid: 6, endGrid: 8, status: 'done' },

  /* Q4 2025 (grid 8–12) */
  { label: 'Display modes', startGrid: 8, endGrid: 11, status: 'done' },
  { label: 'Gamepad support', startGrid: 8, endGrid: 10, status: 'done' },
  { label: 'Animation scrub', startGrid: 9, endGrid: 12, status: 'done' },
  { label: 'Scene JSON', startGrid: 8, endGrid: 10, status: 'done' },
  { label: 'Wireframe & UV', startGrid: 11, endGrid: 13, status: 'done' },

  /* Q1 2026 (grid 12–16) */
  { label: 'Look filters', startGrid: 12, endGrid: 14, status: 'done' },
  { label: 'Custom HDRI', startGrid: 12, endGrid: 14, status: 'done' },
  { label: 'Histogram', startGrid: 12, endGrid: 14, status: 'done' },
  { label: 'Landing page', startGrid: 13, endGrid: 20, status: 'active' },
  { label: 'Isometric cam', startGrid: 13, endGrid: 16, status: 'active' },
  { label: 'Spotlight gobos', startGrid: 14, endGrid: 16, status: 'active' },
  { label: 'Lens effects', startGrid: 14, endGrid: 16, status: 'done' },

  /* Q2 2026 — pre-launch (grid 16–20) */
  { label: 'Stability & QA', startGrid: 16, endGrid: 20, status: 'active' },
  { label: 'Performance pass', startGrid: 16, endGrid: 28, status: 'active' },
  { label: 'Mobile Version', startGrid: 16, endGrid: 24, status: 'active' },
  { label: 'ColorChecker', startGrid: 16, endGrid: 18, status: 'done' },
  { label: 'Rendering Quality', startGrid: 16, endGrid: 24, status: 'priority' },
  { label: 'Presskit', startGrid: 16, endGrid: 18, status: 'todo' },

  /* Q3 2026 (grid 20–24) — launch milestone @ grid 20 */
  { label: 'Bevels V2', startGrid: 21, endGrid: 24, status: 'priority' },
  { label: 'Scene sharing', startGrid: 20, endGrid: 23, status: 'todo' },
  { label: 'Batch export', startGrid: 21, endGrid: 24, status: 'todo' },
  { label: 'OUTLINER', startGrid: 20, endGrid: 24, status: 'future' },

  /* Q4 2026 (grid 24–28) */
  { label: 'Collaboration', startGrid: 24, endGrid: 27, status: 'future' },
  { label: 'Plugin API', startGrid: 25, endGrid: 29, status: 'future' },
  { label: 'Shader Lab+', startGrid: 24, endGrid: 26, status: 'future' },

  /* Q1 2027 (grid 28–32) */
  { label: 'WebGPU refactor', startGrid: 28, endGrid: 32, status: 'future' },
  { label: 'Offline PWA', startGrid: 29, endGrid: 32, status: 'future' },

  /* Q2 2027 → end (grid 32–40) */
  { label: 'Orby V2', startGrid: 32, endGrid: 40, status: 'future' },
];
