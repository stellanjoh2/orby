/**
 * gifski-wasm encode worker — keep encode off the main thread (sync wasm freezes UI).
 * Frames: RGBA ArrayBuffers. Output: GIF bytes.
 */
import encode, { init } from './gifski-wasm.module.js';

const ready = init(new URL('./gifski_wasm_bg.wasm', import.meta.url));

self.onmessage = async (event) => {
  try {
    await ready;
    const { frames, width, height, delay, quality } = event.data;
    const images = frames.map((buffer) => new Uint8Array(buffer));
    // Omit `repeat` for infinite loop. gifski-wasm quirk: `repeat: 0` drops the
    // Netscape loop block (plays once); undefined writes loop count 0 (forever).
    const bytes = await encode({
      frames: images,
      width,
      height,
      resizeWidth: width,
      resizeHeight: height,
      frameDurations: images.map(() => delay),
      quality,
    });
    const out = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    self.postMessage({ ok: true, bytes: out }, [out]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GIF encode failed';
    self.postMessage({ ok: false, message });
  }
};
