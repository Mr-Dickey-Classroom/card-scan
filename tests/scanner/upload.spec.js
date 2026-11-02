// CSV uploads through the real screens at phone width: the files in reference/csv, a file with
// problems, re-uploading a set that has scanned answers, and a roster file.
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const csv = n => fileURLToPath(new URL(`../../reference/csv/${n}`, import.meta.url));
const HEAD = "class,date,set_title,question_number,question,choice_a,choice_b,choice_c,choice_d,correct";
const asFile = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

test.use({ viewport: { width: 360, height: 760 } });

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  page.errors = errors;
  await page.goto("/");
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
});
test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("the 7th and 8th grade files import: 4 sets / 20 questions and 4 sets / 16 questions", async ({ page }) => {
  await page.getByRole("button", { name: "Earth Science" }).click(); // the file says which class, wherever you are
  await page.locator("#qcsvIn").setInputFiles(csv("questions_7th_math_week_of_11-2.csv"));
  await expect(page.getByText("4 sets, 20 questions")).toBeVisible();
  await expect(page.getByText(/problem/)).toHaveCount(0);
  await page.getByRole("button", { name: "Import 4 sets" }).click();
  await expect(page.getByRole("button", { name: "7th Math" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".setitem")).toHaveCount(4);
  await expect(page.locator(".setitem").first()).toContainText("Checkpoint quiz — Sections A, B, C");
  await expect(page.locator(".setitem").first()).toContainText("8 questions");

  // Choices show on the scan screen, with the right one marked
  await page.locator(".setitem").last().click();
  await expect(page.locator(".choices li")).toHaveText(["A w = b + 3", "B w = 3b", "C b = 3w", "D w = b ÷ 3"]);
  await expect(page.locator(".choices li.right")).toHaveText("B w = 3b");
  await page.getByRole("button", { name: "← All sets" }).click();

  await page.locator("#qcsvIn").setInputFiles(csv("questions_8th_math_week_of_11-2.csv"));
  await expect(page.getByText("4 sets, 16 questions")).toBeVisible();
  await page.getByRole("button", { name: "Import 4 sets" }).click();
  await expect(page.getByRole("button", { name: "8th Math" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".setitem")).toHaveCount(4);

  await page.locator("#qcsvIn").setInputFiles(csv("questions_TEMPLATE.csv"));
  await expect(page.getByText("1 set, 2 questions")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 set" }).click();
  await expect(page.locator(".setitem")).toHaveCount(5);

  // Saved: still there after reloading, and a download round-trips
  await page.reload();
  await expect(page.locator(".setitem")).toHaveCount(5);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download as CSV" }).click()]);
  const text = (await (await dl.createReadStream()).toArray()).join("");
  expect(text.split("\r\n")[0]).toBe("﻿" + HEAD);
  expect(text.trim().split("\r\n")).toHaveLength(1 + 18);
});

test("problems are listed by row, unknown classes are asked about, and good rows still import", async ({ page }) => {
  const t = [HEAD, "8th Math,11/9/26,L10,1,Q1,,,,,B", "8th Math,11/9/26,L10,2,Q2,,,,,E", "Math 8,11/9/26,L11,1,Q1,,,,,A"].join("\n");
  await page.locator("#qcsvIn").setInputFiles(asFile("week.csv", t));
  await expect(page.getByText("Row 3: correct answer “E” isn't A–D or Survey.")).toBeVisible();
  await expect(page.getByText("“Math 8” isn't one of your classes.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 1 set" })).toBeDisabled();
  await page.locator('select[data-qmap="Math 8"]').selectOption({ label: "8th Math" });
  await expect(page.getByText("2 sets, 2 questions")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 sets" }).click();
  await expect(page.locator(".setitem")).toHaveCount(2);
});

test("re-uploading a set with scanned answers asks Replace or Keep both, and Replace keeps the answers", async ({ page }) => {
  await page.getByRole("button", { name: "8th Math" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.locator("#addNames").fill("Ava Martinez");
  await page.getByRole("button", { name: "Add to roster" }).click();
  await page.getByRole("tab", { name: "Bell work" }).click();

  const v1 = [HEAD, "8th Math,2026-11-09,L10,1,Typo here,,,,,B"].join("\n");
  await page.locator("#qcsvIn").setInputFiles(asFile("v1.csv", v1));
  await page.getByRole("button", { name: "Import 1 set" }).click();
  await page.locator(".setitem").click();
  await page.locator(".srow .ans").click();
  await page.locator(".picker").getByRole("button", { name: /: C$/ }).click();
  await page.getByRole("button", { name: "← All sets" }).click();

  const v2 = [HEAD, "8th Math,2026-11-09,L10,1,Fixed,,,,,C", "8th Math,2026-11-09,L10,2,New one,,,,,A"].join("\n");
  await page.locator("#qcsvIn").setInputFiles(asFile("v2.csv", v2));
  await expect(page.getByText("You already have this set, with answers scanned for 1 question.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 1 set" })).toBeDisabled();
  await page.getByRole("button", { name: "Replace" }).click();
  await page.getByRole("button", { name: "Import 1 set" }).click();
  await expect(page.locator(".setitem")).toHaveCount(1);
  await expect(page.locator(".setitem")).toContainText("2 questions");
  await page.locator(".setitem").click();
  await expect(page.locator(".srow .ans")).toHaveText("C");
  await expect(page.locator(".panel p").first()).toHaveText("Fixed");
});

test("roster upload: matches existing students, flags a taken card, and asks about unknown classes", async ({ page }) => {
  await page.getByRole("button", { name: "7th Math" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.locator("#addNames").fill("Ava Martinez\nBen Okafor");
  await page.getByRole("button", { name: "Add to roster" }).click();

  await page.getByRole("button", { name: "JH Science" }).click();
  await page.locator("#rcsvIn").setInputFiles(asFile("roster.csv", "name,card\nben okafor,9\nZoe Park,1\nEli Chen,12\n"));
  await expect(page.getByText("Row 2: Ben Okafor keeps card #2 (the file says #9).")).toBeVisible();
  await expect(page.getByText("Row 3: card #1 belongs to Ava Martinez, so Zoe Park gets the next free number.")).toBeVisible();
  await page.getByRole("button", { name: "Add 3 students" }).click();
  expect(await page.locator(".srow .card").allTextContents()).toEqual(["#2", "#3", "#12"]);

  await page.locator("#rcsvIn").setInputFiles(asFile("r2.csv", "name,class\nIvy Lee,Robotics\n"));
  await expect(page.getByText("“Robotics” isn't one of your classes.")).toBeVisible();
  await page.locator('select[data-rmap="Robotics"]').selectOption({ label: "Earth Science" });
  await page.getByRole("button", { name: "Add 1 student" }).click();
  await page.getByRole("button", { name: "Earth Science" }).click();
  expect(await page.locator(".srow .name").allTextContents()).toEqual(["Ivy Lee"]);
});
