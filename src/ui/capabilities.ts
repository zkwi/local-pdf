/**
 * 启动时探测运行环境。目的不是精确判断机型，而是：
 * - 缺硬性能力（Worker / WebAssembly / OffscreenCanvas）就别让用户白等；
 * - 手机浏览器内存和 wasm 限制多，先劝去电脑，仍要试的放行；
 * - 没有 wasm SIMD 的话 ONNX Runtime 起不来，OCR 直接关掉但普通 PDF 照转。
 */
export interface Capabilities {
  readonly worker: boolean;
  readonly wasm: boolean;
  readonly wasmSimd: boolean;
  readonly offscreenCanvas: boolean;
  readonly imageBitmap: boolean;
  readonly mobile: boolean;
  readonly lowMemory: boolean;
}

/** 一个只含 v128 常量的最小 wasm 模块，能通过 validate 就说明支持 SIMD（来自 wasm-feature-detect） */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

function detectMobile(): boolean {
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile === true) return true;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
  // iPadOS 的 UA 伪装成 Mac，靠触控主指针 + 小屏判断
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  return coarse && small;
}

export function probeCapabilities(): Capabilities {
  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';
  let wasmSimd = false;
  if (wasm) {
    try {
      wasmSimd = WebAssembly.validate(SIMD_PROBE);
    } catch {
      wasmSimd = false;
    }
  }
  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
  return {
    worker: typeof Worker === 'function',
    wasm,
    wasmSimd,
    offscreenCanvas: typeof OffscreenCanvas === 'function',
    imageBitmap: typeof createImageBitmap === 'function',
    mobile: detectMobile(),
    lowMemory: deviceMemory !== undefined && deviceMemory <= 2,
  };
}

export function isSupported(caps: Capabilities): boolean {
  return caps.worker && caps.wasm && caps.offscreenCanvas && caps.imageBitmap;
}
