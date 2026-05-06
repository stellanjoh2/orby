/**
 * Remux in-browser recorded H.264 (MP4) into a QuickTime `.mov` container via ffmpeg.wasm.
 * Loads ffmpeg-core JS/WASM from jsDelivr (`toBlobURL`), first run caches in the browser.
 *
 * FFmpeg's bridge worker (`@ffmpeg/ffmpeg/dist/esm/worker.js`) cannot load from a cross-origin CDN
 * (`new Worker` rules). Vendor copies live under `/scripts/vendor/ffmpeg-browser-worker`.
 */
function resolveClassWorkerUrl() {
  const href = String(import.meta?.url ?? '');
  if (href.endsWith('/remuxMp4ToMov.js') || href.includes('/scripts/render/remuxMp4ToMov')) {
    return new URL('../vendor/ffmpeg-browser-worker/worker.js', import.meta.url).href;
  }
  return new URL('./vendor/ffmpeg-browser-worker/worker.js', import.meta.url).href;
}

const FFMPEG_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
const UTIL_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';
const CORE_VER = '0.12.10';

export async function remuxMp4BlobToMov(mp4Blob, onLog) {
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import(/* @vite-ignore */ FFMPEG_BASE),
    import(/* @vite-ignore */ UTIL_BASE),
  ]);

  const ffmpeg = new FFmpeg();
  if (typeof onLog === 'function') {
    ffmpeg.on('log', ({ message }) => {
      try {
        onLog(message);
      } catch {
        /* ignore */
      }
    });
  }

  try {
    const baseURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VER}/dist/esm`;
    await ffmpeg.load({
      classWorkerURL: resolveClassWorkerUrl(),
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    const inputBuf = new Uint8Array(await mp4Blob.arrayBuffer());
    await ffmpeg.writeFile('in.mp4', inputBuf);

    try {
      await ffmpeg.exec(['-i', 'in.mp4', '-c', 'copy', '-f', 'mov', 'out.mov']);
    } catch {
      await ffmpeg.exec(['-y', '-i', 'in.mp4', '-c:v', 'copy', 'out.mov']);
    }

    const out = await ffmpeg.readFile('out.mov');
    const payload = out instanceof Uint8Array ? out : new Uint8Array(out);
    return new Blob([payload], { type: 'video/quicktime' });
  } finally {
    try {
      ffmpeg.terminate();
    } catch {
      /* ignore */
    }
  }
}
