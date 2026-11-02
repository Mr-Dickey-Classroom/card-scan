// Live scan end to end with a fake camera: the page's getUserMedia returns a canvas stream of a
// synthetic desk with 4 cards (about 10 ft away at 1080p), drawn fresh every frame with a little noise.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fakeCamera } from "./fake-camera.js";

const CODES = JSON.parse(readFileSync(new URL("../../reference/card-codes.json", import.meta.url)));
const NAMES = ["Ava Martinez", "Ben Okafor", "Carla Ruiz", "Dev Patel", "Eli Chen"];

test.use({ viewport: { width: 360, height: 760 } });

async function setUp(page) {
  await page.goto("/");
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
  await page.getByRole("button", { name: "7th Math" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.locator("#addNames").fill(NAMES.join("\n"));
  await page.getByRole("button", { name: "Add to roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(5);
  await page.getByRole("tab", { name: "Bell work" }).click();
  await page.getByRole("button", { name: "+ New set" }).first().click();
  await page.getByText("Paste questions instead").click();
  await page.locator("#nsPaste").fill("A B C D");
  await page.getByRole("button", { name: "Fill in from pasted text" }).click();
  await page.getByRole("button", { name: "Save set" }).click();
}

test("live scan: 4 cards fill in, a changed answer updates, a tilted card is listed, Done saves", async ({ page }) => {
  const errors = [], external = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  page.on("request", r => { if (!r.url().startsWith("http://localhost")) external.push(r.url()); });
  await page.addInitScript(fakeCamera, { codes: CODES, cards: { 1: { letter: "A" }, 2: { letter: "B" }, 3: { letter: "C" }, 4: { letter: "D" }, 5: { letter: "A", tilt: 40 } } });
  await setUp(page);

  await page.getByRole("button", { name: "Live scan" }).click();
  const live = page.getByRole("dialog", { name: "Live scan" });
  await expect(live).toBeVisible();
  await expect(live.locator(".lcount")).toHaveText("4 / 5 answered", { timeout: 20_000 });
  await expect(live.locator(".lchip")).toHaveCount(4);
  await expect(live.locator(".lchip.ok")).toHaveText(["Ava A"]);
  await expect(live.locator(".lchip.bad")).toHaveCount(3);

  // Detection speed readout, behind the setting
  await live.getByRole("button", { name: "Scan settings" }).click();
  await live.getByLabel("Show detection speed").check();
  await expect(live.locator(".ldebug")).toContainText("detections/s", { timeout: 10_000 });
  await page.waitForTimeout(2500);
  console.log("live (headless desktop, 1920×1080):", await live.locator(".ldebug").textContent());

  // Hiding right/wrong turns the chips neutral
  await live.getByLabel("Hide right/wrong colors").check();
  await expect(live.locator(".lchip.ok, .lchip.bad")).toHaveCount(0);
  await live.getByLabel("Hide right/wrong colors").uncheck();
  await live.getByRole("button", { name: "Scan settings" }).click();

  // Ben changes his mind: B → A
  await page.evaluate(() => { window.__fake.cards[2].letter = "A"; });
  await expect(live.locator(".lchip").first()).toHaveText("Ben A", { timeout: 10_000 });

  // Missing drawer lists Eli, whose card is tilted
  await live.getByRole("button", { name: "Missing (1)" }).click();
  await expect(live.locator(".ldrawer li")).toHaveText(["#5 Eli Chen tilted"]);
  await expect(live.locator(".ldrawer")).toContainText("ask Eli to hold the card straight");
  await live.locator(".ldrawer").getByRole("button", { name: "Close" }).click();

  await live.getByRole("button", { name: "Done" }).click();
  await expect(live).toBeHidden();
  await expect(page.locator(".note").filter({ hasText: "Read 4 cards in the live scan" })).toBeVisible();
  await expect(page.locator(".note")).toContainText("Tilted too far to read: Eli Chen");
  expect(await page.locator(".srow .ans").allTextContents()).toEqual(["A", "A", "C", "D", "—"]);

  // Camera is released after Done
  expect(await page.evaluate(() => document.querySelector("video"))).toBeNull();
  // Fits 360 px without sideways scrolling
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Saved: still there after reloading
  await page.reload();
  await page.locator(".setitem").first().click();
  expect(await page.locator(".srow .ans").allTextContents()).toEqual(["A", "A", "C", "D", "—"]);

  expect(errors).toEqual([]);
  expect(external, "no requests leave the device").toEqual([]);
});

test("live scan: closing with reads asks first (in the page), and doesn't save", async ({ page }) => {
  await page.addInitScript(fakeCamera, { codes: CODES, cards: { 1: { letter: "C" } } });
  page.on("dialog", d => { throw new Error("dialog used: " + d.message()); });
  await setUp(page);
  await page.getByRole("button", { name: "Live scan" }).click();
  const live = page.getByRole("dialog", { name: "Live scan" });
  await expect(live.locator(".lcount")).toHaveText("1 / 5 answered", { timeout: 20_000 });
  await live.getByRole("button", { name: "Close without saving" }).click();
  await live.getByRole("button", { name: "Keep scanning" }).click();
  await expect(live).toBeVisible();
  await live.getByRole("button", { name: "Close without saving" }).click();
  await live.getByRole("button", { name: "Close, don't save" }).click();
  await expect(live).toBeHidden();
  expect(await page.locator(".srow .ans").allTextContents()).toEqual(["—", "—", "—", "—", "—"]);
});

test("live scan: camera permission refused shows help and a photo fallback", async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); }; });
  await setUp(page);
  await page.getByRole("button", { name: "Live scan" }).click();
  const live = page.getByRole("dialog", { name: "Live scan" });
  await expect(live.locator(".lmsg")).toContainText("Camera permission is off");
  await expect(live.getByRole("button", { name: "Take a photo instead" })).toBeVisible();
  await live.getByRole("button", { name: "Close without saving" }).click();
  await expect(live).toBeHidden();
});
