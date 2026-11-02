// Another teacher's first visit, at phone width: their own classes, card numbers per class, hiding a class.
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 360, height: 760 } });

test("first visit: set up your own classes with card numbers per class", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("dialog: " + d.message()); d.dismiss(); });
  await page.goto("/");
  await expect(page.getByText("Welcome to Card Scan")).toBeVisible();
  await page.locator("#setupClasses").fill("1st period Math\n2nd period Math\n3rd period Science");
  await page.getByLabel("Each class uses cards 1–40").check();
  await page.getByRole("button", { name: "Save my classes" }).click();

  await expect(page.locator(".chip[data-cls]")).toHaveText(["1st period Math", "2nd period Math", "3rd period Science"]);
  await expect(page.getByRole("tab", { name: "Roster" })).toHaveAttribute("aria-selected", "true");
  await page.locator("#addNames").fill("Ava Martinez\nBen Okafor");
  await page.getByRole("button", { name: "Add to roster" }).click();
  await page.getByRole("button", { name: "2nd period Math" }).click();
  await page.locator("#addNames").fill("Carla Ruiz");
  await page.getByRole("button", { name: "Add to roster" }).click();
  await expect(page.locator(".srow .card")).toHaveText(["#1"]);
  await expect(page.getByText("1 of 40 cards in use in this class")).toBeVisible();

  // Going back to one card per student is refused while two students have card #1.
  await page.getByRole("tab", { name: "Cards" }).click();
  await page.getByLabel("One card per student, in every class.").click(); // refused, so it never becomes checked
  await expect(page.getByText("#1: Ava Martinez, Carla Ruiz")).toBeVisible();
  await expect(page.getByLabel("Each class uses cards 1–40.")).toBeChecked();

  // The welcome doesn't come back.
  await page.reload();
  await expect(page.locator(".chip[data-cls]")).toHaveCount(3);
  await page.getByRole("tab", { name: "Bell work" }).click();
  await expect(page.getByText("Welcome to Card Scan")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("hide a class, then bring it back from + Add class", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use the example classes" }).click();
  await expect(page.getByText("Welcome to Card Scan")).toHaveCount(0);
  await page.getByRole("button", { name: "Earth Science" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.getByRole("button", { name: "Hide this class…" }).click();
  await page.getByRole("button", { name: "Hide class", exact: true }).click();
  await expect(page.locator(".chip[data-cls]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Earth Science" })).toHaveCount(0);

  await page.getByRole("button", { name: "+ Add class" }).click();
  await expect(page.getByText("Hidden classes")).toBeVisible();
  await page.getByRole("button", { name: "Bring back" }).click();
  await expect(page.getByRole("button", { name: "Earth Science" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".chip[data-cls]")).toHaveCount(4);
});
