/**
 * Production deploy checks — GitHub Pages build env + injected dist meta.
 * Run automatically at end of `npm run build` on CI; locally via `npm run verify:production-env`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BUG_REPORT_PATH_RE = /^https:\/\/[^/]+\/api\/bug-report\/?$/i;
const TURNSTILE_SITE_KEY_RE = /^0x[A-Za-z0-9_-]+$/;

/**
 * @typedef {{ level: 'error' | 'warn', message: string }} ProductionEnvIssue
 */

/**
 * @param {{ strict?: boolean, distDir?: string }} [options]
 * @returns {ProductionEnvIssue[]}
 */
export function collectProductionEnvIssues(options = {}) {
  const strict =
    options.strict ??
    (process.env.ORBY_STRICT_PRODUCTION_ENV === '1'
      || process.env.CI === 'true'
      || process.env.GITHUB_ACTIONS === 'true');

  /** @type {ProductionEnvIssue[]} */
  const issues = [];

  const bugUrl = process.env.BUG_REPORT_API_URL?.trim() ?? '';
  const turnstileSite = process.env.TURNSTILE_SITE_KEY?.trim() ?? '';
  const shellPhrase = process.env.ORBY_SR_PHRASE?.trim() ?? '';

  if (shellPhrase) {
    issues.push({
      level: 'warn',
      message:
        'ORBY_SR_PHRASE is set but ignored — the studio shell gate is retired and the site stays open. ' +
        'Delete the Actions secret ORBY_SR_PHRASE when convenient.',
    });
  }

  if (!bugUrl) {
    issues.push({
      level: strict ? 'error' : 'warn',
      message:
        'BUG_REPORT_API_URL is unset — GitHub Pages bug reports will POST to /api/bug-report (404). ' +
        'Set Actions variable BUG_REPORT_API_URL to your Vercel URL ending in /api/bug-report.',
    });
  } else if (!BUG_REPORT_PATH_RE.test(bugUrl)) {
    issues.push({
      level: 'warn',
      message:
        `BUG_REPORT_API_URL looks unusual (${bugUrl}) — expected https://<host>/api/bug-report`,
    });
  }

  if (!turnstileSite) {
    issues.push({
      level: strict ? 'error' : 'warn',
      message:
        'TURNSTILE_SITE_KEY is unset — built HTML will skip Turnstile. ' +
        'Set Actions variable TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY on Vercel (must match).',
    });
  } else if (!TURNSTILE_SITE_KEY_RE.test(turnstileSite)) {
    issues.push({
      level: 'warn',
      message: 'TURNSTILE_SITE_KEY format looks unusual — expected a Cloudflare Turnstile site key (0x…).',
    });
  }

  const distDir = options.distDir;
  if (distDir && existsSync(join(distDir, 'index.html'))) {
    const html = readFileSync(join(distDir, 'index.html'), 'utf-8');
    const bugMeta = html.match(/name="orby-bug-report-api"\s+content="([^"]*)"/);
    const injectedBug = bugMeta?.[1]?.trim() ?? '';
    if (!injectedBug) {
      issues.push({
        level: strict ? 'error' : 'warn',
        message:
          'dist/index.html has empty orby-bug-report-api meta — CI variable did not inject at build time.',
      });
    } else if (bugUrl && injectedBug !== bugUrl) {
      issues.push({
        level: 'warn',
        message: 'dist/index.html bug-report meta does not match BUG_REPORT_API_URL env value.',
      });
    }

    const tsMeta = html.match(/name="orby-turnstile-site-key"\s+content="([^"]*)"/);
    const injectedTs = tsMeta?.[1]?.trim() ?? '';
    if (turnstileSite && !injectedTs) {
      issues.push({
        level: strict ? 'error' : 'warn',
        message:
          'dist/index.html has empty orby-turnstile-site-key meta — TURNSTILE_SITE_KEY did not inject.',
      });
    }
  }

  const supportBugJs = distDir ? join(distDir, 'support', 'supportBugReport.js') : '';
  if (supportBugJs && existsSync(supportBugJs)) {
    const supportJs = readFileSync(supportBugJs, 'utf-8');
    if (/scripts\/ui\/bugReportListbox/.test(supportJs)) {
      issues.push({
        level: 'error',
        message:
          'dist/support/supportBugReport.js still imports scripts/ui/bugReportListbox — ' +
          'bundle it in build.js or Pages will 404 the helper and the form will be dead.',
      });
    }
  }

  return issues;
}

/**
 * @param {{ strict?: boolean, distDir?: string }} [options]
 * @returns {boolean} true when no errors (warnings allowed)
 */
export function verifyProductionBuild(options = {}) {
  const issues = collectProductionEnvIssues(options);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warn');

  if (warnings.length) {
    console.warn('\n⚠️  Production env warnings:');
    for (const w of warnings) {
      console.warn(`   • ${w.message}`);
    }
  }

  if (errors.length) {
    console.error('\n❌ Production env errors (deploy blocked):');
    for (const e of errors) {
      console.error(`   • ${e.message}`);
    }
    console.error('\n   See production.env.example for GitHub Actions + Vercel setup.\n');
    return false;
  }

  if (!warnings.length && (options.distDir || process.env.CI)) {
    console.log('✅ Production env check passed (GitHub Pages build vars + dist meta).');
  }

  return true;
}

function isCli() {
  const argv1 = process.argv[1] ?? '';
  return argv1.includes('verifyProductionEnv');
}

if (isCli()) {
  const root = join(process.cwd());
  const distDir = join(root, 'dist');
  const ok = verifyProductionBuild({
    strict: process.env.ORBY_STRICT_PRODUCTION_ENV !== '0',
    distDir: existsSync(distDir) ? distDir : undefined,
  });
  process.exit(ok ? 0 : 1);
}
