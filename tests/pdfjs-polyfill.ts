// pdf.js 6 用了 Promise.try 和 Uint8Array.prototype.toHex/fromHex/toBase64（ES2025），Node 22 还没有
const P = Promise as unknown as {
  try?: (fn: (...a: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
};
if (typeof P.try !== 'function')
  P.try = (fn, ...args) => new Promise((resolve) => resolve(fn(...args)));
const U = Uint8Array.prototype as unknown as Record<string, unknown>;
if (typeof U.toHex !== 'function') {
  U.toHex = function (this: Uint8Array) {
    return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('');
  };
}
if (typeof U.toBase64 !== 'function') {
  U.toBase64 = function (this: Uint8Array) {
    return Buffer.from(this).toString('base64');
  };
}
const UC = Uint8Array as unknown as Record<string, unknown>;
if (typeof UC.fromHex !== 'function') {
  UC.fromHex = (hex: string) => new Uint8Array(Buffer.from(hex, 'hex'));
}
if (typeof UC.fromBase64 !== 'function') {
  UC.fromBase64 = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));
}
// pdf.js 6 还用了 Map/WeakMap 的 getOrInsertComputed / getOrInsert（ES2026 提案），Node 22 同样没有
for (const proto of [Map.prototype, WeakMap.prototype] as unknown as Record<string, unknown>[]) {
  if (typeof proto.getOrInsertComputed !== 'function') {
    proto.getOrInsertComputed = function (
      this: Map<unknown, unknown>,
      key: unknown,
      cb: (k: unknown) => unknown,
    ) {
      if (!this.has(key)) this.set(key, cb(key));
      return this.get(key);
    };
  }
  if (typeof proto.getOrInsert !== 'function') {
    proto.getOrInsert = function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
      if (!this.has(key)) this.set(key, value);
      return this.get(key);
    };
  }
}
