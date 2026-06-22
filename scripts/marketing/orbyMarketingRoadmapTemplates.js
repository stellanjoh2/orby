/**
 * Public roadmap section HTML.
 */
import { escapeMarketingHtml, renderMarketingBodyHtml } from './orbyMarketingImageCredit.js';
import {
  ROADMAP_LAUNCH_MILESTONE,
  ROADMAP_LANE_COUNT,
  ROADMAP_MONTHS_PER_QUARTER,
  ROADMAP_QUARTER_COUNT,
  ROADMAP_QUARTERS,
  ROADMAP_SUBDIVISION_COUNT,
  ROADMAP_TASKS,
  ROADMAP_YEARS,
} from './orbyMarketingRoadmap.js';

/**
 * @param {string} title
 */
function renderRoadmapHeadline(title) {
  return String(title)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<span class="orby-marketing__title-line">${escapeMarketingHtml(line)}</span>`)
    .join('');
}

/**
 * @param {import('./orbyMarketingRoadmap.js').RoadmapTask} task
 */
function renderRoadmapTaskBar(task) {
  const statusClass =
    task.status === 'active'
      ? 'orby-marketing__roadmap-bar--active'
      : task.status === 'done'
        ? 'orby-marketing__roadmap-bar--done'
        : task.status === 'future'
          ? 'orby-marketing__roadmap-bar--future'
          : task.status === 'priority'
            ? 'orby-marketing__roadmap-bar--priority'
            : 'orby-marketing__roadmap-bar--todo';
  return `<div class="orby-marketing__roadmap-bar ${statusClass}" data-orby-marketing-reveal="roadmap-bar" tabindex="0" aria-label="${escapeMarketingHtml(task.label)}" style="--orby-roadmap-start-grid: ${task.startGrid}; --orby-roadmap-end-grid: ${task.endGrid}; --orby-roadmap-lane: ${task.lane};">
      <span class="orby-marketing__roadmap-bar-label">${escapeMarketingHtml(task.label)}</span>
    </div>`;
}

function renderRoadmapLegend() {
  const items = [
    { label: 'Completed', modifier: 'completed' },
    { label: 'Active', modifier: 'active' },
    { label: 'Upcoming', modifier: 'upcoming' },
    { label: 'Future', modifier: 'future' },
    { label: 'Priority', modifier: 'priority' },
  ];

  return `<ul class="orby-marketing__roadmap-legend" aria-label="Roadmap task status">
      ${items
        .map(
          (item) =>
            `<li class="orby-marketing__roadmap-legend-item"><span class="orby-marketing__roadmap-legend-dot orby-marketing__roadmap-legend-dot--${item.modifier}" aria-hidden="true"></span>${escapeMarketingHtml(item.label)}</li>`,
        )
        .join('')}
    </ul>`;
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 */
export function renderRoadmapSection(section) {
  const ledeBlock = section.lede
    ? `<p class="orby-marketing__lede orby-marketing__roadmap-lede">${renderMarketingBodyHtml(section.lede, section.gradientPhrases)}</p>`
    : '';

  const yearLabels = ROADMAP_YEARS.map(
    (year) =>
      `<span class="orby-marketing__roadmap-year" style="--orby-roadmap-span: ${year.span}">${escapeMarketingHtml(year.label)}</span>`,
  ).join('');

  const quarterLabels = ROADMAP_QUARTERS.map(
    (label) => `<span class="orby-marketing__roadmap-quarter">${escapeMarketingHtml(label)}</span>`,
  ).join('');

  const gridLines = Array.from({ length: ROADMAP_QUARTER_COUNT + 1 }, (_, index) => {
    const grid = index * ROADMAP_MONTHS_PER_QUARTER;
    return `<span class="orby-marketing__roadmap-gridline" style="--orby-roadmap-grid: ${grid}"></span>`;
  }).join('');

  const bars = ROADMAP_TASKS.map((task) => renderRoadmapTaskBar(task)).join('');

  const launchGrid = ROADMAP_LAUNCH_MILESTONE.grid;

  return `<section class="orby-marketing__section orby-marketing__section--roadmap" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__inner orby-marketing__roadmap">
      <header class="orby-marketing__roadmap-header">
        <p class="orby-marketing__eyebrow">${escapeMarketingHtml(section.eyebrow || "What's coming")}</p>
        <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title">${renderRoadmapHeadline(section.title)}</h2>
        ${ledeBlock}
      </header>
      <div class="orby-marketing__roadmap-chart" style="--orby-roadmap-lanes: ${ROADMAP_LANE_COUNT}; --orby-roadmap-quarters: ${ROADMAP_QUARTER_COUNT}; --orby-roadmap-subdivisions: ${ROADMAP_SUBDIVISION_COUNT}; --orby-roadmap-months-per-quarter: ${ROADMAP_MONTHS_PER_QUARTER};" role="group" aria-label="Product roadmap from development through Q3 2027, with public launch at the start of Q3 2026. Hover or focus a task to read its full name.">
        <div class="orby-marketing__roadmap-axis" aria-hidden="true">
          <div class="orby-marketing__roadmap-years">${yearLabels}</div>
          <div class="orby-marketing__roadmap-quarters">${quarterLabels}</div>
        </div>
        <div class="orby-marketing__roadmap-stage">
          <div class="orby-marketing__roadmap-grid">${gridLines}<span class="orby-marketing__roadmap-launch-line" style="--orby-roadmap-grid: ${launchGrid}" aria-hidden="true"></span></div>
          <div class="orby-marketing__roadmap-lanes">${bars}</div>
        </div>
        <div class="orby-marketing__roadmap-foot">
          ${renderRoadmapLegend()}
          <span class="orby-marketing__roadmap-launch-label" style="--orby-roadmap-grid: ${launchGrid}">${escapeMarketingHtml(ROADMAP_LAUNCH_MILESTONE.label)}</span>
        </div>
      </div>
    </div>
  </section>`;
}
