// Regression tests for card reading, ported from reference/scanner-tests/.
// Prototype results to hold: 0 wrong ids, 0 wrong letters, misses only below ~26 px per marker.
import { test, expect } from "@playwright/test";

const SCENES = [
  { name: "3000×2000 classroom, mixed sizes, tilt ±25°, shear, blur", opts: { W: 3000, H: 2000, n: 35 } },
  { name: "4000×3000 photo, small and medium cards", opts: { W: 4000, H: 3000, n: 40, smin: 24, smax: 180 } },
  { name: "close-up: very large cards (needs the ½× and ¼× passes)", opts: { W: 3000, H: 2000, n: 6, smin: 300, smax: 520 } },
  // Harsher than the prototype's tests: blur can cost a small card (it gets re-read), never a wrong one.
  { name: "soft focus and heavy JPEG", opts: { W: 3000, H: 2000, n: 30, smin: 30, smax: 140, blur: 2, quality: 0.6 }, mustRead: 40 },
];
const SEEDS = [1, 2, 3];

test.beforeEach(async ({ page }) => {
  page.on("pageerror", e => console.log("page error:", e.message));
  await page.goto("/tests/scanner/harness.html");
  await page.waitForFunction(() => window.ready === true);
});

for (const { name, opts, mustRead = 30 } of SCENES) {
  test(`synthetic: ${name}`, async ({ page }) => {
    const agg = { n: 0, ok: 0, wrong: 0, tilted: 0, phantom: 0, missed: [], ms: 0 };
    for (const seed of SEEDS) {
      const r = await page.evaluate(o => window.runScene(o), { ...opts, seed });
      for (const k of ["n", "ok", "wrong", "tilted", "phantom", "ms"]) agg[k] += r[k];
      agg.missed.push(...r.missed);
    }
    agg.ms = Math.round(agg.ms / SEEDS.length);
    console.log(`${name}\n  => ${JSON.stringify(agg)}`);
    expect(agg.wrong, "wrong letters").toBe(0);
    expect(agg.phantom, "cards read that aren't in the picture").toBe(0);
    expect(agg.missed.filter(s => s >= mustRead), `missed cards ${mustRead} px or bigger`).toEqual([]);
    expect(agg.ok / agg.n, "share read correctly").toBeGreaterThan(0.85);
  });
}

test("tilted 40°: reported as tilted, never a wrong letter", async ({ page }) => {
  const r = await page.evaluate(() => window.runScene({ W: 3000, H: 2000, n: 20, smin: 60, smax: 140, tiltOnly: 40, blur: 0, seed: 7 }));
  console.log(`tilted 40° => ${JSON.stringify(r)}`);
  expect(r.wrong).toBe(0);
  expect(r.ok).toBe(0);
  expect(r.tilted).toBeGreaterThan(15);
});

test("room.jpg: cards 1–8 read A, B, C, D, A, B, C, D", async ({ page }) => {
  const r = await page.evaluate(() => window.runPhoto("/reference/scanner-tests/room.jpg"));
  console.log(`room.jpg => ${JSON.stringify(r)}`);
  expect(r).toEqual({ 1: "A", 2: "B", 3: "C", 4: "D", 5: "A", 6: "B", 7: "C", 8: "D" });
});
