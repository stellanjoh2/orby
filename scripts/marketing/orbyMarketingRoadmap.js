/**
 * Public roadmap grid math — quarter/month subdivisions and computed task spans.
 * Content lives in orbyMarketingRoadmapData.js; markup in orbyMarketingRoadmapTemplates.js.
 */

import {
  ROADMAP_LAUNCH_GRID,
  ROADMAP_LAUNCH_MILESTONE as ROADMAP_LAUNCH_MILESTONE_DATA,
  ROADMAP_QUARTERS,
  ROADMAP_Q2_2026_START_GRID,
  ROADMAP_TASK_GRID_DEFS,
  ROADMAP_YEARS,
} from './orbyMarketingRoadmapData.js';

export {
  ROADMAP_QUARTERS,
  ROADMAP_Q2_2026_START_GRID,
  ROADMAP_TASK_GRID_DEFS,
  ROADMAP_YEARS,
} from './orbyMarketingRoadmapData.js';

/** @typedef {import('./orbyMarketingRoadmapData.js').RoadmapTaskStatus} RoadmapTaskStatus */
/** @typedef {import('./orbyMarketingRoadmapData.js').RoadmapTaskGridDef} RoadmapTaskGridDef */

/**
 * @typedef {RoadmapTaskGridDef & { start: number, width: number, lane: number }} RoadmapTask
 * @property {number} start — computed % (for aria / export)
 * @property {number} width — computed span %
 * @property {number} lane — computed for todo/future; from data for done/active
 */

/** Statuses whose lane is fixed in content data. Todo/future pack into the topmost free lane. */
const ROADMAP_FIXED_LANE_STATUSES = new Set(['done', 'active']);

/**
 * @param {number} aStart
 * @param {number} aEnd — exclusive
 * @param {number} bStart
 * @param {number} bEnd — exclusive
 */
function roadmapGridRangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * @param {number} lane
 * @param {Pick<RoadmapTaskGridDef, 'startGrid' | 'endGrid'>} task
 * @param {readonly Pick<RoadmapTaskGridDef, 'lane' | 'startGrid' | 'endGrid'>[]} placed
 */
function roadmapLaneHasConflict(lane, task, placed) {
  return placed.some(
    (other) =>
      other.lane === lane &&
      roadmapGridRangesOverlap(other.startGrid, other.endGrid, task.startGrid, task.endGrid),
  );
}

/**
 * @param {Pick<RoadmapTaskGridDef, 'startGrid' | 'endGrid'>} task
 * @param {readonly Pick<RoadmapTaskGridDef, 'lane' | 'startGrid' | 'endGrid'>[]} placed
 */
function roadmapFindLowestFreeLane(task, placed) {
  let lane = 0;
  while (roadmapLaneHasConflict(lane, task, placed)) lane += 1;
  return lane;
}

/**
 * Done/active keep authored lanes; todo/future fill the topmost row with no overlap.
 * @param {readonly RoadmapTaskGridDef[]} defs
 * @returns {RoadmapTaskGridDef[]}
 */
export function assignRoadmapTaskLanes(defs) {
  const fixed = defs.filter((task) => ROADMAP_FIXED_LANE_STATUSES.has(task.status));
  const flexible = defs
    .filter((task) => !ROADMAP_FIXED_LANE_STATUSES.has(task.status))
    .sort(
      (a, b) =>
        a.startGrid - b.startGrid || b.endGrid - b.startGrid - (a.endGrid - a.startGrid),
    );

  /** @type {RoadmapTaskGridDef[]} */
  const placed = fixed.map((task) => ({ ...task }));

  for (const task of flexible) {
    placed.push({
      ...task,
      lane: roadmapFindLowestFreeLane(task, placed),
    });
  }

  return placed;
}

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

/** @type {{ label: string, grid: number, at: number }} */
export const ROADMAP_LAUNCH_MILESTONE = {
  ...ROADMAP_LAUNCH_MILESTONE_DATA,
  at: roadmapGridToPercent(ROADMAP_LAUNCH_MILESTONE_DATA.grid),
};

/** @type {RoadmapTask[]} */
export const ROADMAP_TASKS = assignRoadmapTaskLanes(ROADMAP_TASK_GRID_DEFS).map(taskFromGrid);

/** @type {number} */
export const ROADMAP_LANE_COUNT =
  ROADMAP_TASKS.reduce((max, task) => Math.max(max, task.lane), 0) + 1;
