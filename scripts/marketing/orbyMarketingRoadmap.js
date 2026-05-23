/**
 * Public roadmap grid math — quarter/month subdivisions and computed task spans.
 * Content lives in orbyMarketingRoadmapData.js; markup in orbyMarketingRoadmapTemplates.js.
 */

import {
  ROADMAP_LAUNCH_GRID,
  ROADMAP_LAUNCH_MILESTONE as ROADMAP_LAUNCH_MILESTONE_DATA,
  ROADMAP_QUARTERS,
  ROADMAP_TASK_GRID_DEFS,
  ROADMAP_YEARS,
} from './orbyMarketingRoadmapData.js';

export {
  ROADMAP_QUARTERS,
  ROADMAP_TASK_GRID_DEFS,
  ROADMAP_YEARS,
} from './orbyMarketingRoadmapData.js';

/** @typedef {import('./orbyMarketingRoadmapData.js').RoadmapTaskStatus} RoadmapTaskStatus */
/** @typedef {import('./orbyMarketingRoadmapData.js').RoadmapTaskGridDef} RoadmapTaskGridDef */

/**
 * @typedef {RoadmapTaskGridDef & { start: number, width: number }} RoadmapTask
 * @property {number} start — computed % (for aria / export)
 * @property {number} width — computed span %
 */

/** Quarters on the public roadmap */
export const ROADMAP_QUARTER_COUNT = ROADMAP_QUARTERS.length;

/** Month-style subdivisions per quarter (task start/end snap here) */
export const ROADMAP_MONTHS_PER_QUARTER = 4;

/** Total vertical grid lines for task alignment */
export const ROADMAP_SUBDIVISION_COUNT =
  ROADMAP_QUARTER_COUNT * ROADMAP_MONTHS_PER_QUARTER;

/**
 * @param {number} gridIndex — 0–36
 * @returns {number}
 */
export function roadmapGridToPercent(gridIndex) {
  return (gridIndex / ROADMAP_SUBDIVISION_COUNT) * 100;
}

/**
 * @param {RoadmapTaskGridDef} def
 * @returns {RoadmapTask}
 */
export function taskFromGrid(def) {
  const { startGrid, endGrid } = def;
  return {
    ...def,
    start: roadmapGridToPercent(startGrid),
    width: roadmapGridToPercent(endGrid - startGrid),
  };
}

export { ROADMAP_LAUNCH_GRID };

/** @type {{ label: string, grid: number, at: number }} */
export const ROADMAP_LAUNCH_MILESTONE = {
  ...ROADMAP_LAUNCH_MILESTONE_DATA,
  at: roadmapGridToPercent(ROADMAP_LAUNCH_MILESTONE_DATA.grid),
};

/** @type {RoadmapTask[]} */
export const ROADMAP_TASKS = ROADMAP_TASK_GRID_DEFS.map(taskFromGrid);

/** @type {number} */
export const ROADMAP_LANE_COUNT =
  ROADMAP_TASKS.reduce((max, task) => Math.max(max, task.lane), 0) + 1;
