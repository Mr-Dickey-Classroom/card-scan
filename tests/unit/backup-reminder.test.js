import { describe, it, expect } from "vitest";
import { emptyData, backupDue, WEEK } from "../../src/model.js";

const DAY = 24 * 3600 * 1000, T = Date.UTC(2026, 10, 2);
const withStudent = settings => ({ ...emptyData(), students: { a: { name: "Ava Martinez", card: 1 } }, settings });

describe("weekly backup reminder", () => {
  it("waits until there are students to save", () => {
    expect(backupDue({ ...emptyData(), settings: { started: T - 30 * DAY } }, T)).toBe(false);
  });
  it("gives a new phone a week before the first reminder", () => {
    expect(backupDue(withStudent({ started: T - 6 * DAY }), T)).toBe(false);
    expect(backupDue(withStudent({ started: T - WEEK }), T)).toBe(true);
  });
  it("counts the week from the last backup", () => {
    expect(backupDue(withStudent({ started: T - 60 * DAY, backedUp: T - 3 * DAY }), T)).toBe(false);
    expect(backupDue(withStudent({ started: T - 60 * DAY, backedUp: T - 8 * DAY }), T)).toBe(true);
  });
  it("Not now hides it until the snooze runs out", () => {
    const st = { started: T - 60 * DAY, backupSnooze: T + DAY };
    expect(backupDue(withStudent(st), T)).toBe(false);
    expect(backupDue(withStudent(st), T + DAY)).toBe(true);
  });
  it("shows when nothing says when this phone started (an old copy of the data)", () => {
    expect(backupDue(withStudent({}), T)).toBe(true);
  });
});
