// Draws the brand kit into public/brand/: SVG sources plus the PNGs that email
// clients, iOS and link previews need. Run with `node scripts/brand.mjs` from
// frontend/ after changing anything here, and commit the output.
//
// The lettering is a hand-drawn chamfered block alphabet (varsity jersey style),
// so the art needs no font file and renders the same in librsvg, browsers and
// mail clients. sharp comes in with next.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/brand");

// Mirrored in globals.css (--brand-*) and backend/lambdas/common/mailer.py (COLORS).
const C = {
  navy: "#142034",
  field: "#1b2b45",
  gold: "#f1ba4b",
  cream: "#f3ead3",
};

// Glyphs on a 10-unit cap height, y down. Each is a list of polygons; `hole`
// polygons are cut out of the rest.
const H = 10;
const T = 2.3; // stroke weight
const K = 1.1; // corner chamfer

function band(x1, y1, x2, y2, w, box) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
  const [nx, ny] = [(-uy * w) / 2, (ux * w) / 2];
  const ext = 4;
  const a = [x1 - ux * ext, y1 - uy * ext];
  const b = [x2 + ux * ext, y2 + uy * ext];
  return clip(
    [
      [a[0] + nx, a[1] + ny],
      [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny],
      [a[0] - nx, a[1] - ny],
    ],
    box,
  );
}

// Sutherland-Hodgman against an axis-aligned box [x0, y0, x1, y1].
function clip(poly, [x0, y0, x1, y1]) {
  const edges = [
    [(p) => p[0] >= x0, (p, q) => lerpAt(p, q, 0, x0)],
    [(p) => p[0] <= x1, (p, q) => lerpAt(p, q, 0, x1)],
    [(p) => p[1] >= y0, (p, q) => lerpAt(p, q, 1, y0)],
    [(p) => p[1] <= y1, (p, q) => lerpAt(p, q, 1, y1)],
  ];
  for (const [inside, cross] of edges) {
    const out = [];
    poly.forEach((p, i) => {
      const prev = poly[(i + poly.length - 1) % poly.length];
      if (inside(p)) {
        if (!inside(prev)) out.push(cross(prev, p));
        out.push(p);
      } else if (inside(prev)) {
        out.push(cross(prev, p));
      }
    });
    poly = out;
  }
  return poly;
}

function lerpAt(p, q, axis, v) {
  const t = (v - p[axis]) / (q[axis] - p[axis]);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

function glyph(w, polys, holes = []) {
  return { w, polys, holes };
}

const MID = 4.9;
const GLYPHS = {
  U: glyph(6.4, [
    [
      [0, 0],
      [T, 0],
      [T, H - T],
      [6.4 - T, H - T],
      [6.4 - T, 0],
      [6.4, 0],
      [6.4, H - K],
      [6.4 - K, H],
      [K, H],
      [0, H - K],
    ],
  ]),
  N: glyph(6.6, [rect(0, 0, T, H), rect(6.6 - T, 0, T, H), band(T * 0.45, 0, 6.6 - T * 0.45, H, T * 1.15, [0, 0, 6.6, H])]),
  C: glyph(6.2, [
    [
      [K, 0],
      [6.2 - K, 0],
      [6.2, K],
      [6.2, 3.1],
      [6.2 - T, 3.1],
      [6.2 - T, T],
      [T, T],
      [T, H - T],
      [6.2 - T, H - T],
      [6.2 - T, H - 3.1],
      [6.2, H - 3.1],
      [6.2, H - K],
      [6.2 - K, H],
      [K, H],
      [0, H - K],
      [0, K],
    ],
  ]),
  L: glyph(5.4, [
    [
      [0, 0],
      [T, 0],
      [T, H - T],
      [5.4, H - T],
      [5.4, H],
      [0, H],
    ],
  ]),
  E: glyph(5.6, [
    [
      [0, 0],
      [5.6, 0],
      [5.6, T],
      [T, T],
      [T, MID - T / 2 + 0.1],
      [4.9, MID - T / 2 + 0.1],
      [4.9, MID + T / 2 + 0.1],
      [T, MID + T / 2 + 0.1],
      [T, H - T],
      [5.6, H - T],
      [5.6, H],
      [0, H],
    ],
  ]),
  M: glyph(8.4, [
    rect(0, 0, T, H),
    rect(8.4 - T, 0, T, H),
    band(T * 0.5, 0, 4.2, 7.2, T * 1.05, [0, 0, 4.2, H]),
    band(8.4 - T * 0.5, 0, 4.2, 7.2, T * 1.05, [4.2, 0, 8.4, H]),
  ]),
  I: glyph(T, [rect(0, 0, T, H)]),
  K: glyph(6.6, [
    rect(0, 0, T, H),
    band(T * 0.5, 6.9, 6.6 - T * 0.5, 0, T * 1.05, [0, 0, 6.6, H]),
    band(2.9, 4.3, 6.6 - T * 0.5, H, T * 1.1, [0, 0, 6.6, H]),
  ]),
  "'": glyph(1.6, [
    [
      [0, 0],
      [1.6, 0],
      [1.1, 3.4],
      [0, 3.4],
    ],
  ]),
  S: glyph(6.2, [
    [
      [K, 0],
      [6.2 - K, 0],
      [6.2, K],
      [6.2, 3.0],
      [6.2 - T, 3.0],
      [6.2 - T, T],
      [T, T],
      [T, MID - T / 2 + 0.1],
      [6.2 - K, MID - T / 2 + 0.1],
      [6.2, MID - T / 2 + 0.1 + K],
      [6.2, H - K],
      [6.2 - K, H],
      [K, H],
      [0, H - K],
      [0, H - 3.0],
      [T, H - 3.0],
      [T, H - T],
      [6.2 - T, H - T],
      [6.2 - T, MID + T / 2 + 0.1],
      [K, MID + T / 2 + 0.1],
      [0, MID + T / 2 + 0.1 - K],
      [0, K],
    ],
  ]),
  P: glyph(
    6.3,
    [
      [
        [0, 0],
        [6.3 - K, 0],
        [6.3, K],
        [6.3, 6.1 - K],
        [6.3 - K, 6.1],
        [T, 6.1],
        [T, H],
        [0, H],
      ],
    ],
    [rect(T, T, 6.3 - 2 * T, 6.1 - 2 * T)],
  ),
  " ": glyph(2.6, []),
};

const r2 = (n) => Math.round(n * 100) / 100;

function signedArea(poly) {
  return poly.reduce((s, [x, y], i) => {
    const [nx, ny] = poly[(i + 1) % poly.length];
    return s + (x * ny - nx * y);
  }, 0);
}

// Outers clockwise, holes counter-clockwise, so nonzero fill cuts the holes and
// overlapping strokes (N's diagonal over its stems) merge without seams.
function pathOf(poly, x, y, s, hole) {
  const cw = signedArea(poly) > 0;
  const pts = cw === hole ? [...poly].reverse() : poly;
  return "M" + pts.map(([px, py]) => `${r2(x + px * s)} ${r2(y + py * s)}`).join("L") + "Z";
}

function glyphPath(g, x, y, s) {
  return [...g.polys.map((p) => pathOf(p, x, y, s, false)), ...g.holes.map((p) => pathOf(p, x, y, s, true))].join("");
}

/** Text as one path, cap height `size`, top-left at (x, y). Returns { d, width }. */
function text(str, x, y, size, tracking = 0.9) {
  const s = size / H;
  let cx = x;
  let d = "";
  [...str].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) throw new Error(`no glyph for ${JSON.stringify(ch)}`);
    d += glyphPath(g, cx, y, s);
    cx += (g.w + (i < str.length - 1 ? tracking : 0)) * s;
  });
  return { d, width: cx - x };
}

const textWidth = (str, size, tracking) => text(str, 0, 0, size, tracking).width;

/** Varsity tackle-twill: gold letters, navy keyline, cream outer edge. */
function twill(d, size, { fill = C.gold, inner = C.navy, outer = C.cream } = {}) {
  const k = size / H;
  return `<g stroke-linejoin="miter" stroke-miterlimit="4">
  <path d="${d}" fill="${outer}" stroke="${outer}" stroke-width="${r2(k * 1.7)}"/>
  <path d="${d}" fill="${inner}" stroke="${inner}" stroke-width="${r2(k * 0.8)}"/>
  <path d="${d}" fill="${fill}"/>
</g>`;
}

/** Glyphs set along a circle of radius r around (cx, cy), reading left to right. */
function arcText(str, cx, cy, r, size, tracking, bottom) {
  const s = size / H;
  const widths = [...str].map((ch, i) => (GLYPHS[ch].w + (i < str.length - 1 ? tracking : 0)) * s);
  const total = widths.reduce((a, b) => a + b, 0);
  let along = -total / 2;
  return [...str]
    .map((ch, i) => {
      const g = GLYPHS[ch];
      const mid = along + (g.w * s) / 2;
      along += widths[i];
      if (!g.polys.length) return "";
      const deg = r2(((bottom ? -mid : mid) / r) * (180 / Math.PI));
      const y = bottom ? cy + r - size / 2 : cy - r - size / 2;
      return `<path transform="rotate(${deg} ${cx} ${cy})" d="${glyphPath(g, cx - (g.w * s) / 2, y, s)}"/>`;
    })
    .join("\n  ");
}

/** A football lace: one seam with stitches across it. */
function laces(cx, cy, w, color) {
  const n = 5;
  const step = w / (n + 1);
  const ticks = Array.from({ length: n }, (_, i) => {
    const x = r2(cx - w / 2 + step * (i + 1));
    return `<rect x="${r2(x - w * 0.018)}" y="${r2(cy - w * 0.07)}" width="${r2(w * 0.036)}" height="${r2(w * 0.14)}"/>`;
  }).join("");
  return `<g fill="${color}"><rect x="${r2(cx - w / 2)}" y="${r2(cy - w * 0.018)}" width="${r2(w)}" height="${r2(w * 0.036)}"/>${ticks}</g>`;
}

const diamond = (cx, cy, r, fill) =>
  `<path fill="${fill}" d="M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z"/>`;

/** The crest body on a 200-unit square, centred at 100,100. */
function crestBody() {
  const um = text("UM", 0, 0, 52, 0.4);
  const ux = 100 - um.width / 2;
  const mono = text("UM", ux, 60, 52, 0.4).d;
  return `<circle cx="100" cy="100" r="99" fill="${C.cream}"/>
<circle cx="100" cy="100" r="95" fill="${C.navy}"/>
<circle cx="100" cy="100" r="91" fill="none" stroke="${C.gold}" stroke-width="2"/>
<g fill="${C.cream}">
  ${arcText("UNCLE MIKE'S", 100, 100, 77.5, 15, 0.9, false)}
  ${arcText("PICK EM", 100, 100, 77.5, 15, 1.6, true)}
</g>
${diamond(22.5, 100, 4, C.gold)}
${diamond(177.5, 100, 4, C.gold)}
<circle cx="100" cy="100" r="64" fill="${C.field}" stroke="${C.gold}" stroke-width="2.5"/>
<circle cx="100" cy="100" r="59" fill="none" stroke="${C.cream}" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="3 2.4"/>
${twill(mono, 52)}
${laces(100, 132, 42, C.cream)}`;
}

function svg(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">
<title>${title}</title>
${body}
</svg>
`;
}

const NAME = "Uncle Mike's NFL Pick Em";

/** Two-line wordmark at cap height `size`, top-left at (x, y). Returns { body, width, height }. */
function wordmark(x, y, size) {
  const top = textWidth("UNCLE MIKE'S", size, 1.4);
  const sub = size * 0.52;
  const subText = "PICK EM";
  const subW = textWidth(subText, sub, 2.2);
  const gap = size * 0.42;
  const subY = y + size + gap;
  const sx = x + (top - subW) / 2;
  const rule = (x1, x2) =>
    `<rect x="${r2(x1)}" y="${r2(subY + sub / 2 - size * 0.045)}" width="${r2(x2 - x1)}" height="${r2(size * 0.09)}" fill="${C.gold}"/>`;
  const pad = size * 0.35;
  const body = `${twill(text("UNCLE MIKE'S", x, y, size, 1.4).d, size)}
${rule(x + size * 0.1, sx - pad)}
<path fill="${C.cream}" d="${text(subText, sx, subY, sub, 2.2).d}"/>
${rule(sx + subW + pad, x + top - size * 0.1)}`;
  return { body, width: top, height: subY + sub - y };
}

function pinstripes(w, h) {
  return `<defs><pattern id="pin" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${C.navy}"/><rect x="6.5" width="1" height="14" fill="${C.field}"/></pattern></defs>
<rect width="${w}" height="${h}" fill="url(#pin)"/>`;
}

function files() {
  const out = {};
  const crest = crestBody();
  out["crest.svg"] = svg(200, 200, crest, NAME);

  // Site wordmark, transparent, for dark grounds. The twill outline spills
  // a little past the letters, hence the margin.
  const m = 3;
  const wm = wordmark(m, m, 40);
  out["wordmark.svg"] = svg(r2(wm.width + 2 * m), r2(wm.height + 2 * m), wm.body, NAME);

  // Email header: 600x132 at 1x, rendered at 2x.
  {
    const w = 600;
    const h = 132;
    const lock = wordmark(0, 0, 44);
    const lx = 128 + (w - 128 - lock.width) / 2;
    const ly = (h - 6 - lock.height) / 2;
    out["email-header.svg"] = svg(
      w,
      h,
      `${pinstripes(w, h)}
<g transform="translate(18 10) scale(0.53)">${crest}</g>
<g transform="translate(${lx} ${r2(ly)})">${lock.body}</g>
<rect y="${h - 6}" width="${w}" height="4" fill="${C.gold}"/>
<rect y="${h - 2}" width="${w}" height="2" fill="${C.cream}"/>`,
      NAME,
    );
  }

  // Open Graph card, 1200x630.
  {
    const w = 1200;
    const h = 630;
    const lock = wordmark(0, 0, 76);
    const cs = 360;
    const gap = 64;
    const x0 = (w - cs - gap - lock.width) / 2;
    out["og.svg"] = svg(
      w,
      h,
      `${pinstripes(w, h)}
<g transform="translate(${r2(x0)} ${(h - 20 - cs) / 2}) scale(${cs / 200})">${crest}</g>
<g transform="translate(${r2(x0 + cs + gap)} ${r2((h - 20 - lock.height) / 2)})">${lock.body}</g>
<rect y="${h - 20}" width="${w}" height="14" fill="${C.gold}"/>
<rect y="${h - 6}" width="${w}" height="6" fill="${C.cream}"/>`,
      NAME,
    );
  }

  // App icon: the monogram alone, since ring lettering is mush at 16px.
  {
    const um = text("UM", 0, 0, 44, 0.4);
    out["icon.svg"] = svg(
      100,
      100,
      `<rect width="100" height="100" rx="18" fill="${C.navy}"/>
<rect x="5" y="5" width="90" height="90" rx="14" fill="none" stroke="${C.gold}" stroke-width="3"/>
${twill(text("UM", 50 - um.width / 2, 22, 44, 0.4).d, 44)}
${laces(50, 80, 32, C.cream)}`,
      NAME,
    );
  }

  // Favicon sizes: plain gold letters, since the twill outline smears below 48px.
  {
    const um = text("UM", 0, 0, 54, 0.8);
    out["favicon.svg"] = svg(
      100,
      100,
      `<rect width="100" height="100" rx="16" fill="${C.navy}"/>
<path fill="${C.gold}" d="${text("UM", 50 - um.width / 2, 23, 54, 0.8).d}"/>`,
      NAME,
    );
  }
  return out;
}

// A PNG-in-ICO container: browsers and Windows read embedded PNGs.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e);
    head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

const png = (svgText, width) =>
  sharp(Buffer.from(svgText), { density: 300 }).resize({ width }).png({ compressionLevel: 9, palette: false }).toBuffer();

mkdirSync(OUT, { recursive: true });
const out = files();
for (const [name, body] of Object.entries(out)) {
  if (["email-header.svg", "og.svg", "favicon.svg"].includes(name)) continue;
  writeFileSync(join(OUT, name), body);
}

const icons = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(out["favicon.svg"], size) })));
const renders = {
  "email-header.png": png(out["email-header.svg"], 1200),
  "crest.png": png(out["crest.svg"], 400),
  "og.png": png(out["og.svg"], 1200),
  "apple-touch-icon.png": png(out["icon.svg"].replace(/ rx="1[48]"/g, ""), 180),
  "favicon.ico": Promise.resolve(ico(icons)),
};
for (const [name, data] of Object.entries(renders)) writeFileSync(join(OUT, name), await data);
