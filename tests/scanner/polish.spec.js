// Milestone 4 at phone width: projector view, Far/Fast camera, weekly backup reminder, accessibility,
// and the empty screens.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fakeCamera } from "./fake-camera.js";

const CODES = JSON.parse(readFileSync(new URL("../../reference/card-codes.json", import.meta.url)));
const NAMES = ["Ava Martinez", "Ben Okafor", "Carla Ruiz", "Dev Patel", "Eli Chen"];
const CARDS = { 1: { letter: "A" }, 2: { letter: "B" }, 3: { letter: "C" }, 4: { letter: "D" } };

test.use({ viewport: { width: 360, height: 760 } });

async function setUp(page, paste = "1. What is 3 + 4?\nCORRECT: A\n2. Which is prime?\nCORRECT: C") {
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
  await page.locator("#nsPaste").fill(paste);
  await page.getByRole("button", { name: "Fill in from pasted text" }).click();
  await page.getByRole("button", { name: "Save set" }).click();
}

test("projector view: big question and count, live scan without names, show answer, keyboard", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  await page.addInitScript(fakeCamera, { codes: CODES, cards: CARDS });
  await setUp(page);

  await page.getByRole("button", { name: "Projector view" }).click();
  const proj = page.getByRole("dialog", { name: "Projector view" });
  await expect(proj).toBeVisible();
  await expect(proj.getByRole("button", { name: "Close projector view" })).toBeFocused();
  await expect(proj.locator(".pq")).toHaveText("Question 1 of 2");
  await expect(proj.locator(".ptext")).toHaveText("What is 3 + 4?");
  await expect(proj.locator(".pcount")).toHaveText("0 / 5 answered");

  // Live scan from the projector: no names or letters on screen
  await proj.getByRole("button", { name: "Live scan" }).click();
  const live = page.getByRole("dialog", { name: "Live scan" });
  await expect(live).toHaveClass(/proj/);
  await expect(live.locator(".lbigq")).toHaveText("What is 3 + 4?");
  await expect(live.locator(".lcount")).toHaveText("4 / 5 answered", { timeout: 20_000 });
  await expect(live.locator(".lchip")).toHaveCount(0);
  await expect(live.locator(".lq")).not.toContainText("Correct");
  await live.getByRole("button", { name: "Done" }).click();
  await expect(live).toBeHidden();

  // Back on the projector, with the count and still no names
  await expect(proj.locator(".pcount")).toHaveText("4 / 5 answered");
  const text = await proj.textContent();
  for (const n of NAMES) expect(text).not.toContain(n.split(" ")[0]);

  await proj.getByRole("button", { name: "Show answer" }).click();
  await expect(proj.locator(".presult")).toHaveText("Correct answer: A · 25% got it");
  await expect(proj.locator(".pn")).toHaveText(["1", "1", "1", "1"]);
  await expect(proj.locator(".pchoices li.right b")).toHaveText("A");

  // Arrow keys change the question (and hide the answer again), Escape closes
  await page.keyboard.press("ArrowRight");
  await expect(proj.locator(".pq")).toHaveText("Question 2 of 2");
  await expect(proj.locator(".presult")).toHaveCount(0);
  await expect(proj.getByRole("button", { name: "Next question" })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(proj.locator(".pq")).toHaveText("Question 1 of 2");
  await page.keyboard.press("Escape");
  await expect(proj).toBeHidden();
  await expect(page.getByRole("button", { name: "Projector view" })).toBeFocused();

  // The answers were saved to the set
  expect(await page.locator(".srow .ans").allTextContents()).toEqual(["A", "B", "C", "D", "—"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  expect(errors).toEqual([]);
});

test("Far camera asks for 4K and reads cards; the choice is remembered", async ({ page }) => {
  await page.addInitScript(fakeCamera, { codes: CODES, cards: CARDS, max4k: true });
  await setUp(page);
  await page.getByRole("button", { name: "Live scan" }).click();
  const live = page.getByRole("dialog", { name: "Live scan" });
  await expect(live.getByRole("button", { name: "Done" })).toBeFocused();
  await live.getByRole("button", { name: "Scan settings" }).click();
  await expect(live.getByLabel(/Fast \(1080p\)/)).toBeChecked();
  await live.getByLabel("Show detection speed").check();
  await expect(live.locator(".ldebug")).toContainText("1920×1080", { timeout: 15_000 });

  await live.getByLabel(/Far \(4K\)/).check();
  await expect(live.locator(".ldebug")).toContainText("3840×2160", { timeout: 20_000 });
  await expect(live.locator(".lcount")).toHaveText("4 / 5 answered", { timeout: 30_000 });
  expect(await page.evaluate(() => window.__fake.asked)).toEqual([1920, 3840]);
  await live.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Live scan" }).click();
  await expect(live.locator(".ldebug")).toContainText("3840×2160", { timeout: 20_000 });
  expect(await page.evaluate(() => window.__fake.asked)).toEqual([1920, 3840, 3840]);
  await live.getByRole("button", { name: "Done" }).click();
});

test("Far is turned off, with a note, on a camera without 4K", async ({ page }) => {
  await page.addInitScript(fakeCamera, { codes: CODES, cards: CARDS });
  await setUp(page);
  await page.getByRole("button", { name: "Live scan" }).click();
  const live = page.getByRole("dialog", { name: "Live scan" });
  await expect(live.locator(".lcount")).toHaveText("4 / 5 answered", { timeout: 20_000 });
  await live.getByRole("button", { name: "Scan settings" }).click();
  await expect(live.getByLabel(/Far \(4K\)/)).toBeDisabled();
  await expect(live.getByText("This camera doesn't offer 4K")).toBeVisible();
  // the rest of the page can't be reached while the scan is open
  expect(await page.evaluate(() => document.querySelector("header.top").inert && document.querySelector("main").inert)).toBe(true);
  await live.getByRole("button", { name: "Done" }).click();
  expect(await page.evaluate(() => document.querySelector("main").inert)).toBe(false);
});

test("weekly backup reminder: after a week, Not now waits a day, a backup clears it", async ({ page }) => {
  const T0 = new Date("2026-11-02T08:00:00");
  await page.clock.setFixedTime(T0);
  await setUp(page, "A B");
  await page.reload(); // past the first-visit welcome
  await expect(page.getByText("Time for this week's backup")).toHaveCount(0);

  await page.clock.setFixedTime(new Date(T0.getTime() + 8 * 86400e3));
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.getByText("Time for this week's backup")).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Time for this week's backup")).toHaveCount(0);

  await page.clock.setFixedTime(new Date(T0.getTime() + 9.5 * 86400e3));
  await page.reload();
  await expect(page.getByText("Time for this week's backup")).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.locator(".backupdue").getByRole("button", { name: "Download backup" }).click();
  expect((await dl).suggestedFilename()).toMatch(/^STCS_Card_Scan_backup_.*\.json$/);
  await expect(page.getByText("Time for this week's backup")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
  await expect(page.getByText("Time for this week's backup")).toHaveCount(0);
  await page.getByRole("tab", { name: "Cards" }).click();
  await expect(page.getByText("Last backup from this phone")).toBeVisible();
});

test("every control has a name; reduced motion turns animation off", async ({ page }) => {
  await setUp(page, "A B");
  const unnamed = async () => page.evaluate(() => [...document.querySelectorAll("input, select, textarea, button")]
    .filter(el => el.type !== "hidden" && !(el.getAttribute("aria-label") || el.labels?.length || el.textContent.trim() || el.getAttribute("aria-labelledby")))
    .map(el => el.outerHTML.slice(0, 80)));
  for (const tab of ["Bell work", "Roster", "Reports", "Cards"]) {
    await page.getByRole("tab", { name: tab }).click();
    expect(await unnamed(), tab).toEqual([]);
  }
  await page.getByRole("tab", { name: "Bell work" }).click();
  await page.locator(".srow .ans").first().click(); // the answer picker
  await page.getByRole("button", { name: "Edit" }).click();
  expect(await unnamed(), "set screen").toEqual([]);

  const anim = () => page.evaluate(() => getComputedStyle(document.querySelector("#busyText")).animationName);
  expect(await anim()).toBe("pulse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await anim()).toBe("none");
});

test("empty screens say what to do next", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use the example classes" }).click();
  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByText("No students in 8th Math yet")).toBeVisible();
  await page.getByRole("button", { name: "Go to Roster" }).click();
  await expect(page.getByRole("tab", { name: "Roster" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No students in 8th Math yet")).toBeVisible();
  await page.locator("#addNames").fill("Ava Martinez");
  await page.getByRole("button", { name: "Add to roster" }).click();

  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByText("No bell work yet")).toBeVisible();
  await page.getByRole("button", { name: "Go to Bell work" }).click();
  await expect(page.getByText("Two ways to start")).toBeVisible();
  await page.getByRole("button", { name: "+ New set" }).first().click();
  await page.getByRole("button", { name: "Save set" }).click();

  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByText("Nothing scanned yet")).toBeVisible();
  await page.getByRole("button", { name: "Last week" }).click();
  await expect(page.getByText("Nothing in this range")).toBeVisible();
  await page.getByRole("button", { name: "Show all sets" }).click();
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
});
