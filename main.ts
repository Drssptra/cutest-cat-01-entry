// cutest-cat-01 entry — "Mochi", a chibi ginger kitten drawn entirely from code.
//
// Node 22, standard library only, no network, deterministic: the program
// rasterises a soft storybook-style kitten into its own pixel buffer
// (supersampled 2x for clean anti-aliased edges), encodes the result as a
// PNG with node:zlib, and writes it to /output/entry.png (or to
// $MAKEFUN_OUTPUT_DIR outside the grader's container):
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The kitten is built for the judge's rubric: one glance says cat, a huge
// round head tilted to one side, big sparkling teal eyes, a tiny smile,
// pink blush, oversized clumsy paws, one curled striped tail and a little
// coral ball of yarn as its favourite toy — on a plain soft-cream ground
// so the cat is still clear at 300 pixels across.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- canvas

const W = 800; // final image is 800 x 800 (gate: at most 1024 x 1024)
const H = 800;
const SS = 2; // supersampling factor, box-averaged down at the end
const RW = W * SS;
const RH = H * SS;

// Float RGB buffer at render resolution, values 0..255.
const buf = new Float32Array(RW * RH * 3);

type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Optional circular clip (used for the yarn ball's wrapped-string stripes).
let clip: { x: number; y: number; r: number } | null = null;

// Alpha-blend one render pixel. Coordinates are in final-image space.
function blend(fx: number, fy: number, c: RGB, a: number): void {
  if (a <= 0) return;
  if (clip) {
    const dx = fx - clip.x;
    const dy = fy - clip.y;
    if (dx * dx + dy * dy > clip.r * clip.r) return;
  }
  const x = Math.round(fx * SS);
  const y = Math.round(fy * SS);
  if (x < 0 || y < 0 || x >= RW || y >= RH) return;
  const i = (y * RW + x) * 3;
  const ia = 1 - a;
  buf[i] = buf[i] * ia + c[0] * a;
  buf[i + 1] = buf[i + 1] * ia + c[1] * a;
  buf[i + 2] = buf[i + 2] * ia + c[2] * a;
}

// ------------------------------------------------------------ primitives
// All primitives take final-image coordinates and draw through blend(),
// iterating only their own bounding box at render resolution.

function fillEllipse(
  cx: number, cy: number, rx: number, ry: number,
  rot: number, c: RGB, a = 1, soft = 1.2,
): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const ext = Math.max(rx, ry) + 2;
  const x0 = Math.max(0, Math.floor((cx - ext) * SS));
  const x1 = Math.min(RW - 1, Math.ceil((cx + ext) * SS));
  const y0 = Math.max(0, Math.floor((cy - ext) * SS));
  const y1 = Math.min(RH - 1, Math.ceil((cy + ext) * SS));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x / SS - cx;
      const dy = y / SS - cy;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      const d = Math.sqrt((lx * lx) / (rx * rx) + (ly * ly) / (ry * ry));
      // d = 1 at the edge; feather over `soft` final pixels.
      const scale = rx > ry ? rx : ry;
      const alpha = a * Math.min(1, Math.max(0, (1 - d) * (scale / soft) + 0.5));
      if (alpha > 0) blend(x / SS, y / SS, c, Math.min(1, alpha));
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  fillEllipse(cx, cy, r, r, 0, c, a);
}

function pointInPoly(px: number, py: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function fillPoly(pts: [number, number][], c: RGB, a = 1): void {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX * SS));
  const x1 = Math.min(RW - 1, Math.ceil(maxX * SS));
  const y0 = Math.max(0, Math.floor(minY * SS));
  const y1 = Math.min(RH - 1, Math.ceil(maxY * SS));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (pointInPoly(x / SS, y / SS, pts)) blend(x / SS, y / SS, c, a);
    }
  }
}

// A thick smooth stroke along a quadratic Bezier, stamped with soft dots.
function strokeQuad(
  p0: [number, number], p1: [number, number], p2: [number, number],
  width: number, c: RGB, a = 1, steps = 48,
): void {
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0];
    const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
    fillCircle(x, y, width / 2, c, a);
  }
}

function strokeLine(
  p0: [number, number], p1: [number, number], width: number, c: RGB, a = 1,
): void {
  strokeQuad(p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], p1, width, c, a, 24);
}

// Rotate a point around a centre (for the tilted head group).
function rotPt(
  x: number, y: number, cx: number, cy: number, ang: number,
): [number, number] {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

// ---------------------------------------------------------------- palette

const BG_TOP = hex('#FFF9EE');
const BG_BOT = hex('#FFE7C4');
const FUR = hex('#F9CF8E'); // warm cream-ginger
const FUR_LIGHT = hex('#FDEBC0');
const FUR_SHADE = hex('#EDAC55');
const STRIPE = hex('#E08A3C');
const CREAM = hex('#FFF8EC'); // muzzle, belly, paws
const PINK = hex('#FFB3C1');
const NOSE = hex('#F26D85');
const EAR_IN = hex('#FFC7D1');
const INK = hex('#4A3220'); // soft brown line colour
const TEAL = hex('#17A398');
const TEAL_DEEP = hex('#0B5563');
const PUPIL = hex('#1D2733');
const YARN = hex('#FF7A6E');
const YARN_DARK = hex('#DE5148');
const GOLD = hex('#F6B93B');

// ------------------------------------------------------------- background

for (let y = 0; y < RH; y++) {
  const t = y / (RH - 1);
  const row = mix(BG_TOP, BG_BOT, t * t * 0.9 + t * 0.1);
  for (let x = 0; x < RW; x++) {
    const i = (y * RW + x) * 3;
    buf[i] = row[0];
    buf[i + 1] = row[1];
    buf[i + 2] = row[2];
  }
}
// Soft glow behind the kitten and a pastel rug to sit on.
fillEllipse(400, 400, 330, 330, 0, hex('#FFFFFF'), 0.35, 160);
fillEllipse(400, 706, 278, 54, 0, hex('#FFD9A3'), 0.65, 26);
fillEllipse(400, 706, 218, 40, 0, hex('#FFE9C9'), 0.8, 22);
fillEllipse(400, 716, 238, 30, 0, hex('#C97B2D'), 0.16, 18); // ground shadow

// A few sparse decorations: two tiny hearts and three sparkles.
function heart(cx: number, cy: number, s: number, c: RGB, a: number): void {
  fillCircle(cx - s * 0.32, cy - s * 0.12, s * 0.36, c, a);
  fillCircle(cx + s * 0.32, cy - s * 0.12, s * 0.36, c, a);
  fillPoly(
    [[cx - s * 0.62, cy + s * 0.05], [cx + s * 0.62, cy + s * 0.05], [cx, cy + s * 0.85]],
    c, a,
  );
}
function sparkle(cx: number, cy: number, s: number, c: RGB, a: number): void {
  fillPoly(
    [[cx, cy - s], [cx + s * 0.22, cy - s * 0.22], [cx + s, cy], [cx + s * 0.22, cy + s * 0.22],
     [cx, cy + s], [cx - s * 0.22, cy + s * 0.22], [cx - s, cy], [cx - s * 0.22, cy - s * 0.22]],
    c, a,
  );
}
heart(118, 168, 30, PINK, 0.75);
heart(678, 128, 22, PINK, 0.6);
sparkle(648, 238, 17, GOLD, 0.8);
sparkle(140, 330, 13, GOLD, 0.7);
sparkle(600, 84, 12, GOLD, 0.65);

// ------------------------------------------------------------------- tail
// One tail, sweeping out from the body's right side along the ground and
// curling in front, its cream tip resting beside the yarn ball.

strokeQuad([508, 664], [640, 716], [700, 668], 48, FUR_SHADE, 1, 56);
strokeQuad([508, 664], [640, 716], [700, 668], 40, FUR, 1, 56);
// Tail stripes.
strokeQuad([606, 700], [634, 708], [660, 702], 44, STRIPE, 0.5, 10);
strokeQuad([664, 694], [682, 684], [696, 672], 42, STRIPE, 0.45, 8);
// Cream tail tip.
fillCircle(702, 666, 20, CREAM, 1);
fillCircle(694, 676, 15, CREAM, 1);

// ------------------------------------------------------------------- body

fillEllipse(400, 612, 150, 122, 0, FUR_SHADE, 1);
fillEllipse(400, 606, 146, 118, 0, FUR, 1);
fillEllipse(396, 592, 116, 88, 0, FUR_LIGHT, 0.3, 84); // soft top light
fillEllipse(400, 646, 94, 82, 0, CREAM, 1); // belly

// Hind paws: big and a little clumsy, spread wide at the base.
fillEllipse(244, 714, 62, 29, -0.1, FUR_SHADE, 1);
fillEllipse(244, 710, 59, 27, -0.1, CREAM, 1);
fillEllipse(556, 714, 62, 29, 0.1, FUR_SHADE, 1);
fillEllipse(556, 710, 59, 27, 0.1, CREAM, 1);
// Front paws tucked together in the middle, overlapping the belly.
fillEllipse(362, 702, 40, 27, 0, FUR_SHADE, 1);
fillEllipse(362, 698, 37, 24, 0, CREAM, 1);
fillEllipse(438, 702, 40, 27, 0, FUR_SHADE, 1);
fillEllipse(438, 698, 37, 24, 0, CREAM, 1);
// Toe lines.
for (const px of [244, 556, 362, 438]) {
  strokeLine([px - 11, 692], [px - 11, 706], 3.4, hex('#D89A5B'), 0.8);
  strokeLine([px + 11, 692], [px + 11, 706], 3.4, hex('#D89A5B'), 0.8);
}

// -------------------------------------------------------------- yarn ball
// The favourite toy: a coral ball of yarn by the LEFT paw (the tail owns
// the right side, so the composition stays balanced), string trailing
// across the rug toward the front paws.

strokeQuad([186, 712], [280, 740], [384, 726], 6, YARN_DARK, 0.9, 32);
fillCircle(160, 686, 43, YARN_DARK, 1);
fillCircle(160, 684, 41, YARN, 1);
fillEllipse(146, 666, 24, 16, -0.5, hex('#FFA198'), 0.8, 12); // sheen
clip = { x: 160, y: 684, r: 40 };
strokeQuad([126, 658], [160, 678], [194, 662], 7, YARN_DARK, 0.75, 24);
strokeQuad([124, 686], [160, 702], [196, 690], 7, YARN_DARK, 0.75, 24);
strokeQuad([134, 714], [160, 662], [188, 716], 7, YARN_DARK, 0.6, 24);
clip = null;

// ------------------------------------------------------------------- head
// The whole face is drawn in head-local coordinates, then tilted by TILT
// around the head centre so the kitten cocks its head to one side.

const HC: [number, number] = [400, 316];
const TILT = (-7 * Math.PI) / 180;

function hEllipse(lx: number, ly: number, rx: number, ry: number, rot: number, c: RGB, a = 1, soft = 1.2): void {
  const [x, y] = rotPt(lx, ly, HC[0], HC[1], TILT);
  fillEllipse(x, y, rx, ry, rot + TILT, c, a, soft);
}
function hCircle(lx: number, ly: number, r: number, c: RGB, a = 1): void {
  hEllipse(lx, ly, r, r, 0, c, a);
}
function hPoly(pts: [number, number][], c: RGB, a = 1): void {
  fillPoly(pts.map(([x, y]) => rotPt(x, y, HC[0], HC[1], TILT)), c, a);
}
function hStrokeQuad(p0: [number, number], p1: [number, number], p2: [number, number], w: number, c: RGB, a = 1): void {
  strokeQuad(
    rotPt(p0[0], p0[1], HC[0], HC[1], TILT),
    rotPt(p1[0], p1[1], HC[0], HC[1], TILT),
    rotPt(p2[0], p2[1], HC[0], HC[1], TILT),
    w, c, a,
  );
}

// Ears, drawn first so the head circle overlaps their bases. Wide-based
// triangles, splayed slightly outward — kitten ears, not horns.
hPoly([[248, 216], [264, 84], [396, 138]], FUR_SHADE);
hPoly([[248, 216], [264, 84], [396, 138]], FUR);
hPoly([[552, 216], [536, 84], [404, 138]], FUR_SHADE);
hPoly([[552, 216], [536, 84], [404, 138]], FUR);
hPoly([[282, 184], [288, 116], [362, 146]], EAR_IN);
hPoly([[518, 184], [512, 116], [438, 146]], EAR_IN);
// Round the ear tips.
hCircle(264, 88, 10, FUR);
hCircle(536, 88, 10, FUR);

// Head: one big round shape, gently shaded.
hCircle(HC[0], HC[1], 190, FUR_SHADE);
hCircle(HC[0], HC[1] - 4, 187, FUR);
hEllipse(352, 236, 118, 84, -0.4, FUR_LIGHT, 0.6, 70); // forehead light
hEllipse(400, 452, 140, 52, 0, FUR_SHADE, 0.35, 46); // chin shade
// Cheek fluff.
hEllipse(216, 372, 30, 44, 0.5, FUR, 1);
hEllipse(584, 372, 30, 44, -0.5, FUR, 1);

// Forehead stripes (three short rounded bars).
hStrokeQuad([368, 158], [366, 178], [368, 200], 13, STRIPE, 0.85);
hStrokeQuad([400, 148], [400, 172], [400, 196], 13, STRIPE, 0.85);
hStrokeQuad([432, 158], [434, 178], [432, 200], 13, STRIPE, 0.85);
// Side stripes, kept faint so they never read as a second pair of brows.
hStrokeQuad([228, 316], [250, 318], [268, 326], 9, STRIPE, 0.4);
hStrokeQuad([572, 316], [550, 318], [532, 326], 9, STRIPE, 0.4);

// Muzzle.
hEllipse(400, 398, 92, 60, 0, CREAM, 1);
hEllipse(400, 388, 80, 48, 0, hex('#FFFDF6'), 0.7, 30);

// Eyes: huge, bright and sparkling — the centre of the picture.
function eye(lx: number): void {
  const ly = 322;
  hEllipse(lx, ly, 37, 51, 0, hex('#FFFFFF'), 1); // sclera rim
  hEllipse(lx, ly, 34, 48, 0, TEAL_DEEP, 1);
  hEllipse(lx, ly + 4, 29, 41, 0, TEAL, 1);
  hEllipse(lx, ly + 10, 24, 32, 0, hex('#35C4B5'), 0.8, 16); // lower glow
  hEllipse(lx, ly + 2, 15, 25, 0, PUPIL, 1); // pupil
  hCircle(lx - 10, ly - 17, 11, hex('#FFFFFF'), 1); // big highlight
  hCircle(lx + 9, ly + 12, 5.5, hex('#FFFFFF'), 0.95); // small highlight
  // Upper lid line and a tiny lash flick.
  hStrokeQuad([lx - 34, ly - 34], [lx, ly - 54], [lx + 34, ly - 34], 7, INK, 0.85);
}
eye(320);
eye(480);

// Blush.
hEllipse(258, 398, 31, 17, -0.15, PINK, 0.6, 10);
hEllipse(542, 398, 31, 17, 0.15, PINK, 0.6, 10);

// Nose and smile: one small rounded inverted triangle.
hPoly([[383, 370], [417, 370], [400, 392]], NOSE);
hCircle(384, 371, 5.5, NOSE);
hCircle(416, 371, 5.5, NOSE);
hCircle(400, 391, 4.5, NOSE);
hEllipse(393, 374, 5.5, 2.8, 0, hex('#FFC9D4'), 0.9, 2); // nose shine
hEllipse(400, 403, 6.5, 4.6, 0, hex('#FF9FB2'), 0.95, 2); // tiny tongue tip
hStrokeQuad([400, 392], [388, 406], [368, 400], 5.5, INK, 0.9);
hStrokeQuad([400, 392], [412, 406], [432, 400], 5.5, INK, 0.9);

// Whiskers: three a side, fine and slightly curved.
for (const s of [-1, 1]) {
  const bx = 400 + s * 164;
  hStrokeQuad([bx, 372], [bx + s * 46, 366], [bx + s * 92, 354], 3.2, hex('#C98A4B'), 0.7);
  hStrokeQuad([bx, 392], [bx + s * 48, 394], [bx + s * 94, 392], 3.2, hex('#C98A4B'), 0.7);
  hStrokeQuad([bx, 412], [bx + s * 44, 419], [bx + s * 86, 430], 3.2, hex('#C98A4B'), 0.7);
}

// Soft shadow the head casts on the body.
fillEllipse(400, 512, 120, 22, 0, hex('#C97B2D'), 0.14, 14);

// ------------------------------------------------------------ PNG encode

// Box-downsample the render buffer to the final 800 x 800 RGB image.
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 3);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * RW + (x * SS + sx)) * 3;
        r += buf[i];
        g += buf[i + 1];
        b += buf[i + 2];
      }
    }
    const n = SS * SS;
    const o = rowStart + 1 + x * 3;
    raw[o] = Math.round(r / n);
    raw[o + 1] = Math.round(g / n);
    raw[o + 2] = Math.round(b / n);
  }
}

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'entry.png');
writeFileSync(outPath, png);
console.log(`wrote ${outPath}: ${W}x${H} PNG, ${png.length} bytes`);
