// Draws the app icons (school colors: green, yellow, black) and saves them to public/icons/.
// The picture is answer card 1: its real marker pattern, with "A" on top. Run: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const GREEN = "#1d5b34", YELLOW = "#f3c623", BLACK = "#16180f";
const code = JSON.parse(readFileSync(new URL("../reference/card-codes.json", import.meta.url)))[0];
const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

// scale < 1 shrinks the card toward the middle, so it fits inside Android's round "maskable" crop.
function svg({ scale = 1, round = 0 } = {}) {
  const cell = 36, mx = 148, my = 167; // 6×6 cells: black border, 4×4 bits inside (1 = light cell)
  let cells = "";
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
    if ((code >> (15 - (r * 4 + c))) & 1) cells += `<rect x="${mx + (c + 1) * cell}" y="${my + (r + 1) * cell}" width="${cell}" height="${cell}" fill="${YELLOW}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" rx="${round}" fill="${GREEN}"/>
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
<rect x="96" y="77" width="320" height="358" rx="22" fill="${YELLOW}"/>
<text x="256" y="152" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="74" fill="${BLACK}">A</text>
<g shape-rendering="crispEdges"><rect x="${mx}" y="${my}" width="${cell * 6}" height="${cell * 6}" fill="${BLACK}"/>${cells}</g>
</g></svg>`;
}

const icons = [
  { file: "icon-192.png", size: 192, svg: svg({ round: 96 }) },
  { file: "icon-512.png", size: 512, svg: svg({ round: 96 }) },
  { file: "maskable-512.png", size: 512, svg: svg({ scale: 0.78 }) },
  { file: "apple-touch-icon.png", size: 180, svg: svg({ scale: 0.86 }) },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const i of icons) {
  await page.setViewportSize({ width: i.size, height: i.size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${i.size}px;height:${i.size}px}</style>${i.svg}`);
  writeFileSync(new URL(i.file, out), await page.screenshot({ omitBackground: true }));
}
await browser.close();
writeFileSync(new URL("icon.svg", out), svg({ round: 96 }));
console.log("Saved", icons.map(i => i.file).join(", "), "and icon.svg in public/icons/");
