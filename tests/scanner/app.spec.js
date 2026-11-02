// End to end on a phone-sized screen: add students, make a set, scan room.jpg with photo scanning.
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const ROOM = fileURLToPath(new URL("../../reference/scanner-tests/room.jpg", import.meta.url));
const NAMES = ["Ava Martinez", "Ben Okafor", "Carla Ruiz", "Dev Patel", "Eli Chen", "Faith Brooks", "Gabe Nguyen", "Hana Ito"];

test.use({ viewport: { width: 360, height: 760 } });

test("photo scan in the app fills in A B C D A B C D, and it's saved after reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  const external = [];
  page.on("request", r => { if (!r.url().startsWith("http://localhost")) external.push(r.url()); });

  await page.goto("/");
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
  await page.getByRole("button", { name: "8th Math" }).click();

  await page.getByRole("tab", { name: "Roster" }).click();
  await page.locator("#addNames").fill(NAMES.join("\n"));
  await page.getByRole("button", { name: "Add to roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(8);

  await page.getByRole("tab", { name: "Bell work" }).click();
  await page.getByRole("button", { name: "+ New set" }).first().click();
  await page.getByText("Paste questions instead").click();
  await page.locator("#nsPaste").fill("A B C D");
  await page.getByRole("button", { name: "Fill in from pasted text" }).click();
  await page.getByRole("button", { name: "Save set" }).click();

  await page.locator("#picIn").setInputFiles(ROOM);
  await expect(page.locator(".note").filter({ hasText: "Read 8 cards" })).toBeVisible({ timeout: 30_000 });
  const answers = await page.locator(".srow .ans").allTextContents();
  expect(answers).toEqual(["A", "B", "C", "D", "A", "B", "C", "D"]);
  await expect(page.locator(".stat .v").first()).toHaveText("8/8");

  // Fits a 360 px phone without sideways scrolling
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Saved in IndexedDB: still there after reloading
  await page.reload();
  await page.locator(".setitem").first().click();
  expect(await page.locator(".srow .ans").allTextContents()).toEqual(["A", "B", "C", "D", "A", "B", "C", "D"]);

  // A student in another class: added once, keeps the same card number
  await page.getByRole("button", { name: "JH Science" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.locator("#addNames").fill("ben okafor\nZoe Park");
  await page.getByRole("button", { name: "Add to roster" }).click();
  await expect(page.getByText("Ben Okafor — already card #2. Same student?")).toBeVisible();
  await page.getByRole("button", { name: "Add 2 students" }).click();
  expect(await page.locator(".srow .card").allTextContents()).toEqual(["#2", "#9"]);

  expect(errors).toEqual([]);
  expect(external, "no requests leave the device").toEqual([]);
});
