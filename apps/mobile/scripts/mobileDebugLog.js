/** @typedef {'error' | 'rejection' | 'console.error' | 'console.warn' | 'info'} MobileDebugLogLevel */

/**
 * @param {unknown} value
 * @returns {string}
 */
function serializeLogArg(value) {
  if (value == null) return String(value);
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message || String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Patch console after inline capture is live. */
export function installMobileDebugLogCapture() {
  const sink = window.__orbyMobileDebugLog;
  if (!sink || sink._consoleHooked) return;
  sink._consoleHooked = true;

  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args) => {
    sink.push('console.error', args.map(serializeLogArg).join(' '));
    origError.apply(console, args);
  };
  console.warn = (...args) => {
    sink.push('console.warn', args.map(serializeLogArg).join(' '));
    origWarn.apply(console, args);
  };
  sink.mark('module-capture:installed');
}

/**
 * @param {string} name
 * @param {object | null} [data]
 */
export function markMobileDebugLog(name, data = null) {
  window.__orbyMobileDebugLog?.mark?.(name, data);
}

/**
 * @param {import('./MobileScene.js').MobileScene | null | undefined} scene
 * @returns {Record<string, string>}
 */
function formatLastExportTrace(raw, sessionStartedAt) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const phase = parsed?.phase ?? 'unknown';
    const parts = [`${phase}`];
    if (parsed?.result) parts.push(String(parsed.result));
    if (parsed?.reason) parts.push(String(parsed.reason));
    if (parsed?.message) parts.push(String(parsed.message));
    if (typeof parsed?.t === 'number') {
      const ageMs = Date.now() - parsed.t;
      const ageMin = Math.max(0, Math.round(ageMs / 60_000));
      parts.push(`${ageMin}m ago`);
      if (sessionStartedAt) {
        const sessionStartMs = Date.parse(sessionStartedAt);
        if (Number.isFinite(sessionStartMs) && parsed.t < sessionStartMs) {
          parts.push('STALE (before this session)');
        }
      }
    }
    return parts.join(' · ');
  } catch {
    return raw;
  }
}

export function buildMobileDebugSceneExtra(scene) {
  const extra = {};
  const sessionStartedAt = window.__orbyMobileDebugLog?._state?.startedAt ?? null;
  try {
    const raw = localStorage.getItem('orby_mobile_last_export');
    const formatted = formatLastExportTrace(raw, sessionStartedAt);
    if (formatted) extra.lastExport = formatted;
  } catch {
    /* ignore */
  }

  if (!scene) {
    return { scene: 'not constructed', ...extra };
  }

  let webgl = 'unknown';
  try {
    const gl = scene.renderer?.getContext?.();
    webgl = gl ? `ok (${gl.getParameter(gl.VERSION)})` : 'missing';
  } catch (err) {
    webgl = `error (${serializeLogArg(err)})`;
  }

  return {
    scene: 'constructed',
    webgl,
    hasModel: scene.currentModel ? 'yes' : 'no',
    modelFile: scene.getCurrentFileName?.() ?? 'none',
    hdri: scene.getHdriPresetId?.() ?? 'unknown',
    ...extra,
  };
}

/**
 * @param {Record<string, string>} [extra]
 * @returns {Promise<'copied' | 'failed' | 'empty'>}
 */
export async function copyMobileDebugLog(extra = {}) {
  const sink = window.__orbyMobileDebugLog;
  if (!sink?.copyReport) return 'failed';
  const reportExtra = {
    ...sink.getExtra?.(),
    ...extra,
  };
  const ok = await sink.copyReport(reportExtra);
  if (!ok) return 'failed';
  const hasEntries = (sink._state?.entries?.length ?? 0) > 0;
  const hasMarkers = (sink._state?.markers?.length ?? 0) > 1;
  return hasEntries || hasMarkers ? 'copied' : 'empty';
}
