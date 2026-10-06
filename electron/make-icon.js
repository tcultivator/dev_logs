// Generates a minimal 16x16 tray icon PNG
// Run once: node electron/make-icon.js
const fs = require("fs");
const path = require("path");

function createPng16x16() {
  const w = 16, h = 16;
  const pixels = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inSquare = x >= 2 && x <= 13 && y >= 2 && y <= 13;
      const border = inSquare && (x <= 3 || x >= 12 || y <= 3 || y >= 12);
      if (border) {
        pixels.push(34, 211, 238, 255); // cyan border
      } else if (inSquare) {
        pixels.push(12, 14, 20, 200); // dark fill
      } else {
        pixels.push(0, 0, 0, 0); // transparent
      }
    }
  }

  // Minimal PNG encoder
  const rawData = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    rawData[y * (1 + w * 4)] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4;
      const dstIdx = y * (1 + w * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  const zlib = require("zlib");
  const deflated = zlib.deflateSync(rawData);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const buf = Buffer.alloc(4 + type.length + data.length + 4);
    buf.writeUInt32BE(data.length, 0);
    buf.write(type, 4);
    data.copy(buf, 4 + type.length);
    const crcData = Buffer.concat([Buffer.from(type), data]);
    const crc = crc32(crcData);
    buf.writeInt32BE(crc, buf.length - 4);
    return buf;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) | 0;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflated),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outPath = path.join(__dirname, "tray-icon.png");
fs.writeFileSync(outPath, createPng16x16());
console.log("Tray icon written to", outPath);
