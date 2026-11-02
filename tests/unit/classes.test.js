import { describe, it, expect } from "vitest";
import { emptyData, addClass, CLASS_COLORS } from "../../src/model.js";
import { planAdd, applyAdd, classStudents } from "../../src/roster.js";
import { buildBackup, readBackup } from "../../src/backup.js";

describe("adding classes", () => {
  it("adds any number of classes, each at the end of the row", () => {
    const d = emptyData();
    const ids = Array.from({ length: 12 }, (_, i) => addClass(d, `Class ${i + 1}`));
    expect(Object.keys(d.classes)).toHaveLength(16);
    expect(ids.map(id => d.classes[id].order)).toEqual(Array.from({ length: 12 }, (_, i) => i + 5));
    expect(d.classes[ids[0]]).toMatchObject({ name: "Class 1", archived: false, studentIds: [] });
  });
  it("gives new classes the least-used colors first", () => {
    const d = emptyData();
    const colors = [1, 2, 3, 4].map(i => d.classes[addClass(d, `New ${i}`)].color);
    expect(colors).toEqual(CLASS_COLORS.slice(4, 8));
    expect(CLASS_COLORS).toContain(d.classes[addClass(d, "Ninth")].color);
  });
  it("tidies the name and refuses a blank or repeated one (case ignored)", () => {
    const d = emptyData();
    expect(d.classes[addClass(d, "  6th   Math ")].name).toBe("6th Math");
    expect(() => addClass(d, "   ")).toThrow("Type a name");
    expect(() => addClass(d, "7TH MATH")).toThrow("already have a class called 7TH MATH");
  });
  it("a student added to a new class keeps their card number, and it survives a backup", () => {
    const d = emptyData();
    applyAdd(d, "math7", planAdd(d, "math7", ["Ava Martinez", "Ben Okafor"]));
    const id = addClass(d, "Robotics");
    applyAdd(d, id, planAdd(d, id, ["Ben Okafor"]).map(r => ({ ...r, choice: "same" })));
    expect(classStudents(d, id).map(s => [s.name, s.card])).toEqual([["Ben Okafor", 2]]);
    const back = readBackup(JSON.stringify(buildBackup(d))).data;
    expect(back.classes[id].name).toBe("Robotics");
    expect(classStudents(back, id).map(s => s.card)).toEqual([2]);
  });
});
