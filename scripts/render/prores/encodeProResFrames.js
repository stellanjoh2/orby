/**
 * Offline ProRes .MOV encode via vendored prores-wasm-encoder
 * (https://github.com/OlivierEstevez/ProRes-WASM-encoder — Olivier Estevez, LGPL-2.1+).
 * Streams frames into the encoder (constant memory vs buffering every RGBA frame).
 */

import { proresProfileFromSettings } from './proresExportSettings.js';

/** Dev: this module URL; prod bundle: entry.js — both resolve under /scripts/vendor/prores/. */
function resolveProResModuleUrl(parallel) {
  const file = parallel
    ? 'prores-encoder-parallel.module.js'
    : 'prores-encoder.module.js';
  if (/\/(?:entry|main)\.js(?:\?|$)/.test(import.meta.url)) {
    return new URL(`./vendor/prores/${file}`, import.meta.url).href;
  }
  return new URL(`../../vendor/prores/${file}`, import.meta.url).href;
}

/**
 * @typedef {object} ProResEncodeSession
 * @property {(rgba: Uint8Array | Uint8ClampedArray) => Promise<void>} addFrameRgba
 * @property {() => Promise<Blob>} finalizeToBlob
 * @property {() => Promise<void>} destroy
 * @property {number} profile
 * @property {string} profileLabel
 */

/**
 * Create a ProRes encode session (worker pool when available, else single-thread).
 *
 * @param {{
 *   width: number,
 *   height: number,
 *   fps: number,
 *   transparent?: boolean,
 *   qualityPreset?: string,
 * }} opts
 * @returns {Promise<ProResEncodeSession>}
 */
export async function createProResEncodeSession(opts) {
  const width = Math.max(1, Math.round(opts.width));
  const height = Math.max(1, Math.round(opts.height));
  const fps = Math.max(1, Number(opts.fps) || 30);
  const profile = proresProfileFromSettings({
    transparent: !!opts.transparent,
    qualityPreset: opts.qualityPreset,
  });

  const usePool = typeof Worker !== 'undefined';
  if (usePool) {
    try {
      const mod = await import(resolveProResModuleUrl(true));
      const pool = await mod.createProResEncoderPool({
        width,
        height,
        frameRate: fps,
        profile,
      });
      return {
        profile,
        profileLabel: mod.ProfileNames?.[profile] || 'ProRes',
        async addFrameRgba(rgba) {
          await pool.addFrameRgba(rgba);
        },
        async finalizeToBlob() {
          return pool.finalizeToBlob();
        },
        async destroy() {
          await pool.destroy();
        },
      };
    } catch (error) {
      console.warn('ProRes worker pool unavailable; using single-thread encoder', error);
    }
  }

  const mod = await import(resolveProResModuleUrl(false));
  const encoder = await mod.createProResEncoder();
  encoder.initialize({
    width,
    height,
    frameRate: fps,
    profile,
  });
  return {
    profile,
    profileLabel: mod.ProfileNames?.[profile] || 'ProRes',
    async addFrameRgba(rgba) {
      encoder.addFrameRgba(rgba);
      // Yield so progress UI can paint during long single-thread encodes.
      await new Promise((r) => setTimeout(r, 0));
    },
    async finalizeToBlob() {
      return encoder.finalizeToBlob();
    },
    async destroy() {
      encoder.destroy();
    },
  };
}
