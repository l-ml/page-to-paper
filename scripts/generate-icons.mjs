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

function clampByte(value) {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Signed distance to an axis-aligned rounded rectangle with a diagonal top-right dog-ear cut.
 * Negative inside, positive outside.
 */
function sdPaperSheet(u, v, left, right, top, bottom, radius, fold) {
  const cx = (left + right) * 0.5;
  const cy = (top + bottom) * 0.5;
  const hw = (right - left) * 0.5 - radius;
  const hh = (bottom - top) * 0.5 - radius;
  const dx = Math.abs(u - cx) - hw;
  const dy = Math.abs(v - cy) - hh;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  const dRound = Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;

  // Half-plane for diagonal dog-ear cut connecting (right - fold, top) and (right, top + fold)
  const dCut = (u - (right - fold) - (v - top)) * Math.SQRT1_2;
  return Math.max(dRound, dCut);
}

/** Distance to a horizontal pill capsule segment from (x1, y) to (x2, y) with half-width r. */
function sdCapsule(u, v, x1, x2, y, r) {
  const clampedX = Math.max(x1, Math.min(x2, u));
  return Math.hypot(u - clampedX, v - y) - r;
}

/**
 * Reusable pixel sample result buffer to keep 4x4 supersampling zero-allocation.
 * [r, g, b, a] in 0..255.
 */
const sample = [0, 0, 0, 0];

function evaluateAppIcon(u, v, pxSize) {
  // Deep slate gradient backdrop
  const bgT = Math.max(0, Math.min(1, v));
  let r = mix(25, 37, bgT);
  let g = mix(35, 52, bgT);
  let b = mix(40, 59, bgT);

  const left = 0.215;
  const right = 0.785;
  const top = 0.145;
  const bottom = 0.855;
  const radius = 0.042;
  const fold = 0.165;

  // Soft drop shadow beneath the sheet
  const dShadow = sdPaperSheet(u, v - 0.022, left, right, top, bottom, radius, fold);
  if (dShadow < 0.036) {
    const shadowAlpha = 0.34 * (1 - smoothstep(-0.008, 0.036, dShadow));
    r *= 1 - shadowAlpha;
    g *= 1 - shadowAlpha;
    b *= 1 - shadowAlpha;
  }

  const dSheet = sdPaperSheet(u, v, left, right, top, bottom, radius, fold);
  if (dSheet <= 0) {
    const sheetT = Math.max(0, Math.min(1, (v - top) / (bottom - top)));
    let sr = mix(247, 235, sheetT);
    let sg = mix(242, 227, sheetT);
    let sb = mix(233, 213, sheetT);

    // Subtle fold-flap cast shadow directly below the dog-ear
    const foldLeft = right - fold;
    const foldBottom = top + fold;
    if (u >= foldLeft - 0.01 && u <= right && v >= foldBottom && v <= foldBottom + 0.032) {
      const dist = v - foldBottom;
      const creaseAlpha = 0.14 * (1 - dist / 0.032) * smoothstep(foldLeft - 0.01, foldLeft + 0.01, u);
      sr *= 1 - creaseAlpha;
      sg *= 1 - creaseAlpha;
      sb *= 1 - creaseAlpha;
    }

    // Dog-ear inner folded flap
    if (u >= foldLeft && v <= foldBottom && u - foldLeft <= v - top) {
      const shadeT = Math.max(0, Math.min(1, (v - top) / fold));
      sr = mix(222, 206, shadeT);
      sg = mix(213, 196, shadeT);
      sb = mix(198, 181, shadeT);
    }

    // Swallowtail terracotta bookmark ribbon
    const bmLeft = 0.295;
    const bmRight = 0.385;
    const bmMid = (bmLeft + bmRight) * 0.5;
    const bmBottom = 0.445;
    const notch = 0.048;
    const cutV = bmBottom - notch * (1 - Math.abs(u - bmMid) / ((bmRight - bmLeft) * 0.5));
    if (u >= bmLeft && u <= bmRight && v >= top && v <= cutV) {
      const bmT = Math.max(0, Math.min(1, (v - top) / (bmBottom - top)));
      sr = mix(152, 123, bmT);
      sg = mix(62, 46, bmT);
      sb = mix(49, 37, bmT);
    }

    // Clean typography lines in deep ink (#1e2a2e)
    const inkLines = [
      sdCapsule(u, v, 0.32, 0.56, 0.53, 0.022),
      sdCapsule(u, v, 0.32, 0.68, 0.618, 0.0145),
      sdCapsule(u, v, 0.32, 0.68, 0.683, 0.0145),
      sdCapsule(u, v, 0.32, 0.535, 0.748, 0.0145),
    ];
    for (const dLine of inkLines) {
      if (dLine <= pxSize * 0.5) {
        const tInk = 1 - smoothstep(-pxSize * 0.5, pxSize * 0.5, dLine);
        sr = mix(sr, 30, tInk);
        sg = mix(sg, 42, tInk);
        sb = mix(sb, 46, tInk);
      }
    }

    r = sr;
    g = sg;
    b = sb;
  }

  sample[0] = r;
  sample[1] = g;
  sample[2] = b;
  sample[3] = 255;
}

function evaluateExtensionIcon(u, v, pxSize) {
  const left = 0.145;
  const right = 0.855;
  const top = 0.085;
  const bottom = 0.915;
  const radius = 0.055;
  const fold = 0.21;
  const stroke = Math.max(0.034, 1.45 * pxSize);

  const dSheet = sdPaperSheet(u, v, left, right, top, bottom, radius, fold);
  if (dSheet > 0) {
    sample[0] = 0;
    sample[1] = 0;
    sample[2] = 0;
    sample[3] = 0;
    return;
  }

  // Crisp outer ink outline so the sheet stays legible on both light and dark Safari toolbars
  if (dSheet > -stroke) {
    sample[0] = 30;
    sample[1] = 42;
    sample[2] = 46;
    sample[3] = 255;
    return;
  }

  const sheetT = Math.max(0, Math.min(1, (v - top) / (bottom - top)));
  let r = mix(247, 236, sheetT);
  let g = mix(242, 228, sheetT);
  let b = mix(233, 214, sheetT);

  const foldLeft = right - fold;
  const foldBottom = top + fold;
  if (u >= foldLeft && v <= foldBottom && u - foldLeft <= v - top) {
    r = 212;
    g = 202;
    b = 186;
    // Inner crease stroke on the folded flap
    if (u - foldLeft < stroke * 0.72 || foldBottom - v < stroke * 0.72) {
      r = 148;
      g = 140;
      b = 128;
    }
  }

  // Swallowtail terracotta bookmark ribbon
  const bmLeft = 0.255;
  const bmRight = 0.375;
  const bmMid = (bmLeft + bmRight) * 0.5;
  const bmBottom = 0.455;
  const notch = 0.055;
  const cutV = bmBottom - notch * (1 - Math.abs(u - bmMid) / ((bmRight - bmLeft) * 0.5));
  if (u >= bmLeft && u <= bmRight && v >= top && v <= cutV) {
    const bmT = Math.max(0, Math.min(1, (v - top) / (bmBottom - top)));
    r = mix(154, 126, bmT);
    g = mix(62, 46, bmT);
    b = mix(50, 38, bmT);
  }

  const inkLines = [
    sdCapsule(u, v, 0.275, 0.56, 0.545, 0.028),
    sdCapsule(u, v, 0.275, 0.725, 0.648, 0.020),
    sdCapsule(u, v, 0.275, 0.725, 0.733, 0.020),
    sdCapsule(u, v, 0.275, 0.53, 0.818, 0.020),
  ];
  for (const dLine of inkLines) {
    if (dLine <= pxSize * 0.5) {
      const tInk = 1 - smoothstep(-pxSize * 0.5, pxSize * 0.5, dLine);
      r = mix(r, 30, tInk);
      g = mix(g, 42, tInk);
      b = mix(b, 46, tInk);
    }
  }

  sample[0] = r;
  sample[1] = g;
  sample[2] = b;
  sample[3] = 255;
}

function png(size, opaque) {
  const channels = opaque ? 3 : 4;
  const stride = size * channels + 1;
  const raw = Buffer.alloc(stride * size);
  const pxSize = 1 / size;
  const evaluate = opaque ? evaluateAppIcon : evaluateExtensionIcon;
  const grid = 4;
  const invSamples = 1 / (grid * grid);

  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      for (let sy = 0; sy < grid; sy += 1) {
        const v = (y + (sy + 0.5) / grid) * pxSize;
        for (let sx = 0; sx < grid; sx += 1) {
          const u = (x + (sx + 0.5) / grid) * pxSize;
          evaluate(u, v, pxSize);
          const alpha = sample[3] / 255;
          rAcc += sample[0] * alpha;
          gAcc += sample[1] * alpha;
          bAcc += sample[2] * alpha;
          aAcc += sample[3];
        }
      }

      const index = row + 1 + x * channels;
      const avgAlpha = aAcc * invSamples;
      if (opaque) {
        raw[index] = clampByte(rAcc * invSamples);
        raw[index + 1] = clampByte(gAcc * invSamples);
        raw[index + 2] = clampByte(bAcc * invSamples);
      } else if (avgAlpha <= 0) {
        raw[index] = 0;
        raw[index + 1] = 0;
        raw[index + 2] = 0;
        raw[index + 3] = 0;
      } else {
        const norm = 255 / aAcc;
        raw[index] = clampByte(rAcc * norm);
        raw[index + 1] = clampByte(gAcc * norm);
        raw[index + 2] = clampByte(bAcc * norm);
        raw[index + 3] = clampByte(avgAlpha);
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function write(file, size, opaque) {
  fs.writeFileSync(file, png(size, opaque));
}

const resources = path.join(root, "PageToPaper/Extension/Resources");
fs.mkdirSync(resources, { recursive: true });
for (const size of [48, 64, 96, 128, 256, 512]) {
  write(path.join(resources, `icon-${size}.png`), size, false);
}
const appIcon = path.join(root, "PageToPaper/App/Assets.xcassets/AppIcon.appiconset");
fs.mkdirSync(appIcon, { recursive: true });
write(path.join(appIcon, "AppIcon-1024.png"), 1024, true);
console.log("icons ok");
