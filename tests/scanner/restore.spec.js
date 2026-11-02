// Restoring a prototype (version 1) backup through the Cards tab, at phone width.
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const SAMPLE = fileURLToPath(new URL("../../reference/sample-backup.json", import.meta.url));
test.use({ viewport: { width: 360, height: 760 } });

test("the prototype's sample backup restores, with its roster and bell work", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.locator("#restoreIn").setInputFiles(SAMPLE);
  await expect(page.getByText("(from the first version of the app): 8 students, 1 bell work set")).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Backup restored")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "8th Math" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(8);
  await page.getByRole("tab", { name: "Bell work" }).click();
  await expect(page.locator(".setitem")).toHaveCount(1);
});

test("a v1 backup with a student in two classes lists the card numbers that changed, before and after", async ({ page }) => {
  const v1 = {
    app: "stcs-card-scan", version: 1,
    classes: {
      math8: { name: "8th Math", order: 2, students: [{ id: "ben1", name: "Ben Okafor", card: 2 }] },
      jhsci: { name: "JH Science", order: 4, students: [{ id: "ben2", name: "ben  okafor", card: 5 }, { id: "ava", name: "Ava Martinez", card: 2 }] },
    },
    sets: { jhsci: { s1: { title: "Bell work", date: "2026-10-30", questions: [{ text: "", correct: "A" }], answers: { 0: { ben2: "A", ava: "B" } } } } },
  };
  await page.goto("/");
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.locator("#restoreIn").setInputFiles({ name: "old.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(v1)) });
  await expect(page.getByText("Ben Okafor: kept #2 (was #5 in JH Science).")).toBeVisible();
  await expect(page.getByText("Ava Martinez: now #1 (was #2, which Ben Okafor keeps).")).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();

  // Still listed after restoring, until dismissed.
  await expect(page.getByText("Backup restored.")).toBeVisible();
  await expect(page.getByText("Ava Martinez: now #1 (was #2, which Ben Okafor keeps).")).toBeVisible();
  await page.getByRole("button", { name: "Done, cards handed out" }).click();
  await expect(page.getByText("Backup restored.")).toHaveCount(0);

  await page.getByRole("button", { name: "JH Science" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(2);
});
