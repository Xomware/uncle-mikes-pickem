// Renders the brand kit into public/brand/: favicon, apple-touch icon, OG card
// and the two email headers (PNG at 2x, since email clients don't load SVG).
//
//   npx playwright-core install chromium   # once
//   npm run brand                           # then commit public/brand/
//
// Each asset is an HTML page drawn with the site's own fonts (Google Fonts) and
// field art (app/art/*.svg), screenshotted in headless Chromium. That keeps the
// stencil lettering identical to the site without converting glyphs to paths.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/brand");
const logo = (name) => {
  const type = name.endsWith(".svg") ? "image/svg+xml" : "image/png";
  return `data:${type};base64,${readFileSync(join(OUT, "logos", name)).toString("base64")}`;
};
const art = (name) => `url("data:image/svg+xml;base64,${readFileSync(join(ROOT, "app/art", name)).toString("base64")}")`;

// The day palette from globals.css, as hex for the PNG pages.
const C = {
  turf1: "#2f6a35",
  turf2: "#397a3d",
  end1: "#123f20",
  end2: "#174827",
  chalk: "#f6f5ea",
  yellow: "#f5cf2a",
  ribbon: "#e2572a",
  board: "#16120d",
  night1: "#0f1e15",
  night2: "#132419",
  blood: "#e8433a",
  flood: "#eef3fb",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Graduate&family=Big+Shoulders:wght@800&display=block";

const goalpost = (color = C.yellow) => `
  <svg viewBox="0 0 32 40" fill="none">
    <g stroke="${color}" stroke-width="3.2" stroke-linecap="square" fill="none">
      <path d="M16 39V30c0-3-2-4-2-6" /><path d="M5 22h22M5 22V2.5M27 22V2.5" />
    </g>
    <path d="M5 1 .6 3.2 5 5.4zM27 1l4.4 2.2L27 5.4z" fill="${C.ribbon}" />
  </svg>`;

const BASE_CSS = `
  * { margin: 0; box-sizing: border-box; }
  body { width: var(--w); height: var(--h); overflow: hidden; }
  .endzone { background: repeating-linear-gradient(-55deg, ${C.end1} 0 calc(22px * var(--s)), ${C.end2} 0 calc(44px * var(--s))); }
  .turf {
    background:
      repeating-linear-gradient(to bottom, transparent 0 calc(var(--y) * 5 - 3px), #f6f5ea9e 0 calc(var(--y) * 5)),
      ${art("grass.svg")} 0 0 / 240px 240px,
      repeating-linear-gradient(to bottom, ${C.turf1} 0 calc(var(--y) * 5), ${C.turf2} 0 calc(var(--y) * 10));
  }
  .chalk { font-family: "Big Shoulders"; font-weight: 800; text-transform: uppercase; color: ${C.chalk}; }
  .center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
`;

const page = (w, h, body, css = "") => `<!doctype html><html><head>
  <link rel="stylesheet" href="${FONTS}">
  <style>:root { --w: ${w}px; --h: ${h}px; --s: 1; --y: 24px; } ${BASE_CSS} ${css}</style>
  </head><body>${body}</body></html>`;

const og = page(
  1200,
  630,
  `<div class="endzone center" style="height:630px;border-bottom:12px solid ${C.chalk}">
      <img src="${logo("logo-primary.png")}" style="height:540px;filter:drop-shadow(0 0 30px #f5cf2a55)">
    </div>`,
);

/** 600x150 email headers at 2x. The goal line under them is the template's border, so it shows with images off too. */
const emailHeader = page(
  1200,
  300,
  `<div class="endzone center" style="height:300px">
      <img src="${logo("lockup-horizontal.svg")}" style="height:210px">
    </div>`,
);

const suddenDeathHeader = page(
  1200,
  300,
  `<div class="center" style="height:300px;position:relative;overflow:hidden;
      background:
        conic-gradient(from 128deg at 6% 0%, transparent, #eef3fb30 14deg, transparent 34deg),
        conic-gradient(from 198deg at 94% 0%, transparent, #eef3fb30 20deg, transparent 34deg),
        repeating-linear-gradient(to bottom, transparent 0 117px, #eef3fb26 117px 120px),
        repeating-linear-gradient(to bottom, ${C.night1} 0 120px, ${C.night2} 120px 240px);
      ">
      <div class="chalk" style="font-size:34px;letter-spacing:.6em;color:${C.flood};display:flex;align-items:center;gap:24px">
        <span style="width:70px;height:5px;background:${C.blood}"></span>Overtime<span style="width:70px;height:5px;background:${C.blood}"></span>
      </div>
      <div style="font-family:Graduate;font-size:118px;line-height:1.05;text-transform:uppercase;color:${C.blood};-webkit-text-stroke:5px ${C.blood};paint-order:stroke fill;text-shadow:0 0 36px #e8433a99">Sudden death</div>
      <div class="chalk" style="font-size:24px;letter-spacing:.4em;color:${C.flood};opacity:.8;margin-top:6px">Uncle Mike's Pick Em</div>
    </div>`,
);

/** ICO with one embedded PNG: every browser that reads .ico reads PNG entries. */
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

/** The square icon: a yellow goalpost on two mow stripes over the goal line. Flat, so it holds up at 16px. */
const iconSvg = (radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="${C.turf1}"/>
  <rect y="21" width="64" height="21" fill="${C.turf2}"/>
  <rect y="51" width="64" height="3" fill="${C.chalk}"/>
  <g transform="translate(14 7) scale(1.12)">${goalpost().replace(/<\/?svg[^>]*>/g, "")}</g>
</svg>
`;
// iOS rounds the touch icon itself; transparent corners would show black.
const iconPage = (size, radius) =>
  page(
    size,
    size,
    `<img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(iconSvg(radius)).toString("base64")}">`,
    "body { background: transparent }",
  );

const browser = await chromium.launch();
async function shot(html, w, h, scale, transparent = false) {
  const tab = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await tab.setContent(html, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  const png = await tab.screenshot({ omitBackground: transparent });
  await tab.close();
  return png;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "icon.svg"), iconSvg(12));
writeFileSync(join(OUT, "favicon.ico"), ico(await shot(iconPage(32, 12), 32, 32, 1, true), 32));
// The UM tile on its own end zone colour, so the square iOS crop has no corners to fill.
const touchIcon = `<body style="margin:0;background:${C.end1}"><img src="${logo("icon-monogram.svg")}" width="180" height="180" style="display:block">`;
writeFileSync(join(OUT, "apple-touch-icon.png"), await shot(touchIcon, 180, 180, 1));
writeFileSync(join(OUT, "og.png"), await shot(og, 1200, 630, 1));
writeFileSync(join(OUT, "email-header.png"), await shot(emailHeader, 1200, 300, 1));
writeFileSync(join(OUT, "email-header-sudden-death.png"), await shot(suddenDeathHeader, 1200, 300, 1));
await browser.close();
