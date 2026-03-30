/**
 * Generates a minimal 256×256 PNG placeholder icon at assets/icon.png.
 * Runs automatically via `postinstall`. Replace the output file with your
 * own artwork before distributing.
 *
 * Uses only Node.js built-in modules — no extra dependencies required.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── PNG helpers ───────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const combined = Buffer.concat([typeBuf, data]);
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(size, r, g, b) {
  // IHDR: width, height, bit-depth=8, color-type=2 (RGB), compress=0, filter=0, interlace=0
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  // Raw pixel rows: filter byte (0) + RGB per pixel
  const rowLen = 1 + size * 3;
  const raw = Buffer.allocUnsafe(size * rowLen);
  for (let y = 0; y < size; y++) {
    const off = y * rowLen;
    raw[off] = 0; // filter none
    for (let x = 0; x < size; x++) {
      raw[off + 1 + x * 3] = r;
      raw[off + 2 + x * 3] = g;
      raw[off + 3 + x * 3] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const assetsDir = path.join(__dirname, '..', 'assets');
const iconPath = path.join(assetsDir, 'icon.png');

if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

if (fs.existsSync(iconPath)) {
  // Don't overwrite a custom icon the user may have placed
  console.log('  ℹ  assets/icon.png already exists — skipping placeholder creation.');
} else {
  // Indigo #6366f1 → rgb(99, 102, 241)
  const png = createPng(256, 99, 102, 241);
  fs.writeFileSync(iconPath, png);
  console.log('  ✓  Created assets/icon.png (256×256 indigo placeholder). Replace with your own artwork before distributing.');
}
