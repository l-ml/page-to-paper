import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, paint) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size);
      const index = row + 1 + x * 4;
      raw[index] = r;
      raw[index + 1] = g;
      raw[index + 2] = b;
      raw[index + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ink = [30, 42, 46, 255];
const paper = [243, 237, 227, 255];
const fold = [214, 206, 194, 255];
const mark = [140, 58, 47, 255];

function paint(x, y, size, transparentBackdrop) {
  const left = size * 0.22;
  const right = size * 0.78;
  const top = size * 0.16;
  const bottom = size * 0.84;
  const foldSize = size * 0.14;
  if (x < left || x > right || y < top || y > bottom) {
    return transparentBackdrop ? [0, 0, 0, 0] : ink;
  }
  if (x > right - foldSize && y < top + foldSize && x - (right - foldSize) + (y - top) < foldSize) {
    return fold;
  }
  const bookmarkLeft = left + size * 0.1;
  const bookmarkRight = bookmarkLeft + size * 0.07;
  if (x >= bookmarkLeft && x <= bookmarkRight && y >= top && y <= top + size * 0.28) {
    return mark;
  }
  const lineLeft = left + size * 0.22;
  const lineRight = right - size * 0.1;
  const thickness = Math.max(1, size * 0.012);
  for (const start of [0.42, 0.5, 0.58]) {
    const lineTop = top + size * start;
    if (y >= lineTop && y <= lineTop + thickness && x >= lineLeft && x <= lineRight) {
      return ink;
    }
  }
  return paper;
}

function write(file, size, transparentBackdrop) {
  fs.writeFileSync(file, png(size, (x, y, canvas) => paint(x, y, canvas, transparentBackdrop)));
}

const resources = path.join(root, "PageToPaper/Extension/Resources");
fs.mkdirSync(resources, { recursive: true });
for (const size of [48, 64, 96, 128, 256, 512]) {
  write(path.join(resources, `icon-${size}.png`), size, true);
}
const appIcon = path.join(root, "PageToPaper/App/Assets.xcassets/AppIcon.appiconset");
fs.mkdirSync(appIcon, { recursive: true });
write(path.join(appIcon, "AppIcon-1024.png"), 1024, false);
console.log("icons ok");
