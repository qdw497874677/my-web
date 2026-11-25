import { Readable } from "node:stream";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Buffer, start: number, end: number) {
  let crc = 0xffffffff;
  for (let p = start; p < end; p++) crc = crcTable[(crc ^ data[p]!) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function webpImageChunk(data: Buffer, type: string, start: number, size: number): boolean {
  if (type === "VP8 ")
    return (
      size >= 10 && data[start + 3] === 0x9d && data[start + 4] === 0x01 && data[start + 5] === 0x2a
    );
  if (type === "VP8L") return size >= 5 && data[start] === 0x2f;
  return false;
}

function webpFrame(data: Buffer, start: number, end: number): boolean {
  let p = start + 16,
    image = false;
  if (p > end) return false;
  while (p + 8 <= end) {
    const type = data.toString("latin1", p, p + 4),
      size = data.readUInt32LE(p + 4),
      payload = p + 8;
    p = payload + size + (size & 1);
    if (p > end) return false;
    if (type === "VP8 " || type === "VP8L") {
      if (image || !webpImageChunk(data, type, payload, size)) return false;
      image = true;
    }
  }
  return p === end && image;
}

// Parse container framing, not pixel data. Use latin1 for tags: ascii decoding masks the high bit.
export function rasterType(data: Buffer): string | undefined {
  const n = data.length;
  if (n >= 45 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let p = 8,
      ihdr = false,
      idat = false;
    while (p + 12 <= n) {
      const length = data.readUInt32BE(p),
        end = p + 12 + length;
      if (end > n) return undefined;
      if (crc32(data, p + 4, p + 8 + length) !== data.readUInt32BE(p + 8 + length))
        return undefined;
      const type = data.toString("latin1", p + 4, p + 8);
      if (!ihdr) {
        if (
          type !== "IHDR" ||
          length !== 13 ||
          !data.readUInt32BE(p + 8) ||
          !data.readUInt32BE(p + 12)
        )
          return undefined;
        ihdr = true;
      }
      if (type === "IDAT") idat = true;
      if (type === "IEND") return length === 0 && idat && end === n ? "image/png" : undefined;
      p = end;
    }
    return undefined;
  }
  if (n >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let p = 2,
      frame = false,
      scan = false;
    while (p < n) {
      if (data[p++] !== 0xff) return undefined;
      while (p < n && data[p] === 0xff) p++;
      const marker = data[p++];
      if (marker === 0xd9) return frame && scan && p === n ? "image/jpeg" : undefined;
      if (marker === undefined || marker === 0 || marker === 0xd8) return undefined;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > n) return undefined;
      const length = data.readUInt16BE(p);
      if (length < 2 || p + length > n) return undefined;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      )
        frame = length >= 8 && data.readUInt16BE(p + 3) > 0 && data.readUInt16BE(p + 5) > 0;
      p += length;
      if (marker === 0xda) {
        scan = true;
        while (p < n) {
          if (data[p] !== 0xff) {
            p++;
            continue;
          }
          let marker = p + 1;
          while (marker < n && data[marker] === 0xff) marker++;
          if (marker >= n) return undefined;
          if (
            (marker === p + 1 && data[marker] === 0) ||
            (data[marker]! >= 0xd0 && data[marker]! <= 0xd7)
          ) {
            p = marker + 1;
            continue;
          }
          break;
        }
      }
    }
    return undefined;
  }
  if (n >= 14 && ["GIF87a", "GIF89a"].includes(data.toString("latin1", 0, 6))) {
    let p = 13,
      image = false;
    if (!data.readUInt16LE(6) || !data.readUInt16LE(8)) return undefined;
    if (data[10]! & 0x80) p += 3 * (1 << ((data[10]! & 7) + 1));
    const blocks = (requireData = false) => {
      let hasData = false;
      while (p < n) {
        const size = data[p++]!;
        if (!size) return !requireData || hasData;
        hasData = true;
        p += size;
        if (p > n) return false;
      }
      return false;
    };
    while (p < n) {
      const code = data[p++];
      if (code === 0x3b) return image && p === n ? "image/gif" : undefined;
      if (code === 0x21) {
        if (p >= n) return undefined;
        p++;
        if (!blocks()) return undefined;
        continue;
      }
      if (code !== 0x2c || p + 9 > n) return undefined;
      const packed = data[p + 8]!;
      if (!data.readUInt16LE(p + 4) || !data.readUInt16LE(p + 6)) return undefined;
      p += 9;
      if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
      if (p >= n) return undefined;
      const codeSize = data[p++]!;
      if (codeSize < 2 || codeSize > 8 || !blocks(true)) return undefined;
      image = true;
    }
    return undefined;
  }
  if (
    n >= 20 &&
    data.toString("latin1", 0, 4) === "RIFF" &&
    data.toString("latin1", 8, 12) === "WEBP" &&
    data.readUInt32LE(4) + 8 === n
  ) {
    let p = 12,
      image = false;
    while (p + 8 <= n) {
      const type = data.toString("latin1", p, p + 4),
        size = data.readUInt32LE(p + 4),
        start = p + 8;
      p += 8 + size + (size & 1);
      if (p > n) return undefined;
      if (type === "VP8 " || type === "VP8L") {
        if (!webpImageChunk(data, type, start, size)) return undefined;
        image = true;
      }
      if (type === "ANMF") {
        if (!webpFrame(data, start, start + size)) return undefined;
        image = true;
      }
    }
    return p === n && image ? "image/webp" : undefined;
  }
  return undefined;
}

export async function readBounded(source: Buffer | NodeJS.ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(source)) {
    if (source.length > MAX_IMAGE_BYTES) throw new Error("image too large");
    return source;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of source as Readable) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_IMAGE_BYTES) {
      (source as Readable).destroy();
      throw new Error("image too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}
