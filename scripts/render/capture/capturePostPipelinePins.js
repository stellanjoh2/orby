/**
 * Post-pipeline pins for offline capture — ASCII grid density + lens distortion RT chain.
 *
 * **ASCII / pixel presets:** `pinReferenceLogicalSize` keeps viewport grid density on 2× export
 * (matches screen, looks zoomed) — product policy per EXPORT_REFACTOR_PLAN Chunk 3.
 */

/** @type {ReadonlyArray<keyof import('../PostProcessingPipeline.js').PostProcessingPipeline>} */
const PIXEL_PRESET_PIPELINE_KEYS = [
  'creativeLookAscii',
  'creativeLookEga',
  'creativeLookC64',
  'creativeLookGameBoy',
  'creativeLookNes',
  'creativeLookMegaDrive',
  'creativeLookIntellivision',
  'creativeLookGba',
  'creativeLookApple2',
  'creativeLookDither',
];

/**
 * @param {import('../PostProcessingPipeline.js').PostProcessingPipeline | null | undefined} postPipeline
 * @param {{ x: number, y: number }} logicalSize — interactive viewport logical size before export resize
 */
export function pinAsciiReferenceForCapture(postPipeline, logicalSize) {
  if (!postPipeline) return;
  for (const key of PIXEL_PRESET_PIPELINE_KEYS) {
    postPipeline[key]?.pinReferenceLogicalSize?.(logicalSize.x, logicalSize.y);
  }
}

/** @param {import('../PostProcessingPipeline.js').PostProcessingPipeline | null | undefined} postPipeline */
export function unpinAsciiReferenceForCapture(postPipeline) {
  if (!postPipeline) return;
  for (const key of PIXEL_PRESET_PIPELINE_KEYS) {
    postPipeline[key]?.unpinReferenceLogicalSize?.();
  }
}

/**
 * Interactive fisheye/lens renders to screen; PNG readback uses composer RTs — keep lens in RT chain.
 *
 * @param {import('../PostProcessingPipeline.js').PostProcessingPipeline | null | undefined} postPipeline
 * @returns {{ lensRenderToScreen: boolean } | null}
 */
export function pinLensDistortionForExportCapture(postPipeline) {
  const pass = postPipeline?.lensDistortionPass;
  if (!pass?.enabled) return null;
  const snapshot = { lensRenderToScreen: pass.renderToScreen };
  pass.renderToScreen = false;
  return snapshot;
}

/**
 * @param {import('../PostProcessingPipeline.js').PostProcessingPipeline | null | undefined} postPipeline
 * @param {{ lensRenderToScreen: boolean } | null} snapshot
 */
export function unpinLensDistortionForExportCapture(postPipeline, snapshot) {
  if (!snapshot) return;
  const pass = postPipeline?.lensDistortionPass;
  if (pass) pass.renderToScreen = snapshot.lensRenderToScreen;
}
