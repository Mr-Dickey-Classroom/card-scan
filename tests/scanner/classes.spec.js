// Adding classes at phone width: from the chip row, and from a CSV file that names a new class.
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 360, height: 760 } });
const asFile = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

test("+ Add class makes a fifth and sixth class, opens its roster, and they're saved after reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  await page.goto("/");
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");

  await page.getByRole("button", { name: "+ Add class" }).click();
  await page.locator("#newClassName").fill("7th math");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("You already have a class called 7th math.");

  await page.locator("#newClassName").fill("Robotics");
  await page.locator("#newClassName").press("Enter");
  await expect(page.getByRole("button", { name: "Robotics" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab", { name: "Roster" })).toHaveAttribute("aria-selected", "true");
  await page.locator("#addNames").fill("Ava Martinez\nBen Okafor");
  await page.getByRole("button", { name: "Add to roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(2);

  await page.getByRole("button", { name: "+ Add class" }).click();
  await page.locator("#newClassName").fill("6th Math");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await expect(page.locator(".chip[data-cls]")).toHaveCount(6);

  await page.reload();
  await expect(page.locator(".chip[data-cls]")).toHaveCount(6);
  await page.getByRole("button", { name: "Robotics" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.locator(".srow")).toHaveCount(2);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(wide).toBeLessThanOrEqual(360);
  expect(errors).toEqual([]);
});

test("a questions file with a class the app doesn't know can make that class", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#sync")).toHaveText("Saved on this phone");
  const t = "class,date,set_title,question_number,question,correct\nRobotics,2026-11-09,Bell work,1,What is a sensor?,B\n";
  await page.locator("#qcsvIn").setInputFiles(asFile("robotics.csv", t));
  await expect(page.getByText("“Robotics” isn't one of your classes.")).toBeVisible();
  await page.locator('select[data-qmap="Robotics"]').selectOption({ label: "Make a new class called “Robotics”" });
  await page.getByRole("button", { name: "Import 1 set" }).click();
  await expect(page.getByRole("button", { name: "Robotics" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".setitem")).toHaveCount(1);
});
