/** CRC-32（IEEE 802.3）：PNG 的块校验和 zip 的文件校验共用 */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** 接着上一段的结果继续算（首段传 0），可以分块喂大文件 */
export function crc32(bytes: Uint8Array, previous = 0, start = 0, end = bytes.length): number {
  let c = (previous ^ 0xffffffff) >>> 0;
  for (let i = start; i < end; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
