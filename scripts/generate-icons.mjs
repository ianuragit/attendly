// Generates Attendly's original placeholder icons (rounded blue square with a white check mark)
// as PNGs, with no image dependencies. Run: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];
const BG = [36, 89, 184]; // brand-600
const FG = [255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// Signed distance to a rounded square centred at (0.5, 0.5) in unit coordinates.
const roundedSquareSd = (x, y, half = 0.46, r = 0.2) => {
  const qx = Math.abs(x - 0.5) - (half - r);
  const qy = Math.abs(y - 0.5) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const segmentDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax,
    vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
};
// Check mark polyline.
const checkSd = (x, y) =>
  Math.min(segmentDist(x, y, 0.27, 0.52, 0.43, 0.68), segmentDist(x, y, 0.43, 0.68, 0.74, 0.34)) -
  0.075;

function render(size) {
  const ss = 4; // supersampling per axis
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte + RGBA
    for (let px = 0; px < size; px++) {
      let bgCov = 0,
        fgCov = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (roundedSquareSd(x, y) <= 0) {
            bgCov++;
            if (checkSd(x, y) <= 0) fgCov++;
          }
        }
      }
      const n = ss * ss;
      const a = bgCov / n;
      const f = bgCov ? fgCov / bgCov : 0;
      const o = 1 + px * 4;
      for (let c = 0; c < 3; c++) row[o + c] = Math.round(BG[c] * (1 - f) + FG[c] * f);
      row[o + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), render(size));
  console.log(`wrote icons/icon-${size}.png`);
}
