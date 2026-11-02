// Milestone 3: the built app (what GitHub Pages serves) is installable and opens with no internet.
import { test, expect } from "@playwright/test";

const BUILT = "http://localhost:5180/";
test.use({ viewport: { width: 360, height: 760 } });

test("the built app has a manifest with icons, and opens offline after one visit", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));

  await page.goto(BUILT);
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");

  const manifest = await (await page.request.get(BUILT + "manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) expect((await page.request.get(BUILT + icon.src)).ok(), icon.src).toBe(true);
  expect(manifest.icons.some(i => i.purpose === "maskable")).toBe(true);

  // Wait until the service worker has saved the app and controls the page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Make a class roster, then go offline ("airplane mode") and open the app again.
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.locator("#addNames").fill("Ava Martinez\nBen Okafor");
  await page.getByRole("button", { name: "Add to roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(2);

  await context.setOffline(true);
  await page.goto(BUILT);
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(2);
  // The scanner's background worker file loads offline too.
  const cached = await page.evaluate(async () => {
    const c = await caches.open((await caches.keys()).find(k => k.startsWith("stcs-card-scan-")));
    return (await c.keys()).map(r => r.url);
  });
  expect(cached.some(u => u.includes("scan-worker"))).toBe(true);
  await page.getByRole("tab", { name: "Cards" }).click();
  await expect(page.getByText("Put Card Scan on your home screen")).toBeVisible();
  expect(errors).toEqual([]);
});
