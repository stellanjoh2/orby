// node_modules/gifski-wasm/pkg/gifski_wasm.js
var wasm;
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : { decode: () => {
  throw Error("TextDecoder not available");
} };
if (typeof TextDecoder !== "undefined") {
  cachedTextDecoder.decode();
}
var cachedUint8Memory0 = null;
function getUint8Memory0() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
var WASM_VECTOR_LEN = 0;
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8Memory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
var cachedUint32Memory0 = null;
function getUint32Memory0() {
  if (cachedUint32Memory0 === null || cachedUint32Memory0.byteLength === 0) {
    cachedUint32Memory0 = new Uint32Array(wasm.memory.buffer);
  }
  return cachedUint32Memory0;
}
function passArray32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getUint32Memory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
var cachedInt32Memory0 = null;
function getInt32Memory0() {
  if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}
function encode(frames, num_of_frames, width, height, fps, frame_durations, quality, repeat, resize_width, resize_height) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passArray8ToWasm0(frames, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(frame_durations) ? 0 : passArray32ToWasm0(frame_durations, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    wasm.encode(retptr, ptr0, len0, num_of_frames, width, height, isLikeNone(fps) ? 16777215 : fps, ptr1, len1, isLikeNone(quality) ? 16777215 : quality, !isLikeNone(repeat), isLikeNone(repeat) ? 0 : repeat, !isLikeNone(resize_width), isLikeNone(resize_width) ? 0 : resize_width, !isLikeNone(resize_height), isLikeNone(resize_height) ? 0 : resize_height);
    var r0 = getInt32Memory0()[retptr / 4 + 0];
    var r1 = getInt32Memory0()[retptr / 4 + 1];
    var v3 = getArrayU8FromWasm0(r0, r1).slice();
    wasm.__wbindgen_free(r0, r1 * 1, 1);
    return v3;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        if (module.headers.get("Content-Type") != "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  return imports;
}
function __wbg_init_memory(imports, maybe_memory) {
}
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedInt32Memory0 = null;
  cachedUint32Memory0 = null;
  cachedUint8Memory0 = null;
  return wasm;
}
async function __wbg_init(input) {
  if (wasm !== void 0)
    return wasm;
  if (typeof input === "undefined") {
    input = new URL("gifski_wasm_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports();
  if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
    input = fetch(input);
  }
  __wbg_init_memory(imports);
  const { instance, module } = await __wbg_load(await input, imports);
  return __wbg_finalize_init(instance, module);
}
var gifski_wasm_default = __wbg_init;

// node_modules/gifski-wasm/dist/encode.js
var gifskiModule;
async function init(moduleOrPath) {
  if (!gifskiModule) {
    gifskiModule = gifski_wasm_default(moduleOrPath);
  }
  return gifskiModule;
}
function framesToBuffer(frames) {
  const totalLength = frames.reduce((acc, frame) => {
    const _frame = "data" in frame ? frame.data : frame;
    return acc + _frame.length;
  }, 0);
  const framesBuffer = new Uint8Array(totalLength);
  let offset = 0;
  frames.forEach((frame) => {
    const _frame = "data" in frame ? frame.data : frame;
    framesBuffer.set(_frame, offset);
    offset += _frame.length;
  });
  return framesBuffer;
}
async function _internal_encode(wasmEncodeFn, { frames, width, height, fps, frameDurations, quality, repeat, resizeWidth, resizeHeight }) {
  if (frames.length === 1) {
    throw new Error("At least 2 frames are required to encode a GIF with gifski");
  }
  if ("duration" in frames[0] && frameDurations) {
    throw new Error("frameDurations cannot be provided when frames have durations");
  }
  if ("duration" in frames[0] && "imageData" in frames[0]) {
    frameDurations = frames.map((frame) => {
      if ("duration" in frame) {
        return frame.duration;
      }
      throw new Error("All frames must have a duration");
    });
    frames = frames.map((frame) => {
      if ("imageData" in frame) {
        return frame.imageData;
      }
      throw new Error("All frames must have an imageData");
    });
  }
  if (!fps && !frameDurations) {
    throw new Error("Either fps or frameDurations must be provided");
  }
  if (fps && frameDurations) {
    throw new Error("fps and frameDurations cannot be provided at the same time");
  }
  if (frameDurations && frameDurations.length !== frames.length) {
    throw new Error("The number of frame durations must match the number of frames");
  }
  const numOfFrames = frames.length;
  const framesBuffer = framesToBuffer(frames);
  const _frameDurations = frameDurations ? new Uint32Array(frameDurations) : void 0;
  const buffer = await wasmEncodeFn(framesBuffer, numOfFrames, width, height, fps, _frameDurations, quality, repeat, resizeWidth, resizeHeight);
  if (!buffer)
    throw new Error("Encoding error.");
  return buffer;
}
async function encode2(options) {
  await init();
  return _internal_encode(encode, options);
}
var encode_default = encode2;
export {
  _internal_encode,
  encode_default as default,
  encode2 as encode,
  init
};
