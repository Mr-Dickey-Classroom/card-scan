import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readBackup, buildBackup, migrateV1 } from "../../src/backup.js";
import { emptyData } from "../../src/model.js";
import { classStudents } from "../../src/roster.js";

const sample = readFileSync(new URL("../../reference/sample-backup.json", import.meta.url), "utf8");
const v1 = (classes, sets = {}) => ({ app: "stcs-card-scan", version: 1, classes, sets });
const cls = (name, order, students) => ({ name, order, students });

describe("reading backups", () => {
  it("imports the prototype's sample backup (v1)", () => {
    const { data, changes, version } = readBackup(sample);
    expect(version).toBe(1);
    expect(changes).toEqual([]);
    expect(Object.keys(data.students)).toHaveLength(8);
    expect(classStudents(data, "math8").map(s => s.card)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Object.keys(data.classes)).toEqual(["math7", "math8", "earth", "jhsci"]);
    const set = data.sets.math8.dpbpzxq3;
    expect(set.title).toBe("Bell work");
    expect(set.answers[0]["7cefdvnv"]).toBe("A");
    expect(set).not.toHaveProperty("id");
  });
  it("round-trips a v2 backup", () => {
    const d = readBackup(sample).data;
    const again = readBackup(JSON.stringify(buildBackup(d)));
    expect(again.version).toBe(2);
    expect(again.data).toEqual(d);
  });
  it("rejects files that aren't backups", () => {
    expect(() => readBackup("not json")).toThrow("isn't a Card Scan backup");
    expect(() => readBackup('{"app":"other"}')).toThrow("isn't a Card Scan backup");
    expect(() => readBackup('{"app":"stcs-card-scan","version":9,"classes":{}}')).toThrow("newer version");
  });
  it("starts from the four default classes", () => {
    expect(Object.values(emptyData().classes).map(c => c.name)).toEqual(["7th Math", "8th Math", "Earth Science", "JH Science"]);
  });
});

describe("v1 → v2 migration", () => {
  it("1–2. merges the same student across classes (case and spacing ignored), keeps the first id, and rewrites answers", () => {
    const b = v1({
      math7: cls("7th Math", 1, [{ id: "ava7", name: "Ava Martinez", card: 1 }]),
      jhsci: cls("JH Science", 4, [{ id: "avaJ", name: "  ava  martinez", card: 1 }]),
    }, {
      jhsci: { s1: { id: "s1", title: "Rocks", date: "2026-11-02", questions: [{ text: "", correct: "A" }], answers: { 0: { avaJ: "A" } } } },
    });
    const { data, changes } = migrateV1(b);
    expect(data.students).toEqual({ ava7: { name: "Ava Martinez", card: 1 } });
    expect(data.classes.math7.studentIds).toEqual(["ava7"]);
    expect(data.classes.jhsci.studentIds).toEqual(["ava7"]);
    expect(data.sets.jhsci.s1.answers).toEqual({ 0: { ava7: "A" } });
    expect(changes).toEqual([]);
  });
  it("3. keeps the number from the earliest class and lists the change", () => {
    const b = v1({
      jhsci: cls("JH Science", 4, [{ id: "benJ", name: "Ben Okafor", card: 5 }]),
      math8: cls("8th Math", 2, [{ id: "ben8", name: "Ben Okafor", card: 2 }]),
    });
    const { data, changes } = migrateV1(b);
    expect(data.students).toEqual({ ben8: { name: "Ben Okafor", card: 2 } });
    expect(changes).toEqual(["Ben Okafor: kept #2 (was #5 in JH Science)."]);
  });
  it("4. gives the second of two different students with the same number the lowest free number", () => {
    const b = v1({
      math7: cls("7th Math", 1, [{ id: "a", name: "Ava", card: 1 }, { id: "c", name: "Cal", card: 3 }]),
      math8: cls("8th Math", 2, [{ id: "b", name: "Ben", card: 1 }, { id: "d", name: "Dee", card: 2 }]),
    });
    const { data, changes } = migrateV1(b);
    // Ben can't take #2 (Dee has it) or #3 (Cal), so he gets #4
    expect(Object.fromEntries(Object.values(data.students).map(s => [s.name, s.card]))).toEqual({ Ava: 1, Cal: 3, Ben: 4, Dee: 2 });
    expect(changes).toEqual(["Ben: now #4 (was #1, which Ava keeps)."]);
  });
  it("3+4 together: a merged student's kept number can still collide", () => {
    const b = v1({
      math7: cls("7th Math", 1, [{ id: "a", name: "Ava", card: 7 }]),
      math8: cls("8th Math", 2, [{ id: "b", name: "Ben", card: 7 }, { id: "a2", name: "Ava", card: 9 }]),
    });
    const { data, changes } = migrateV1(b);
    expect(data.students).toEqual({ a: { name: "Ava", card: 7 }, b: { name: "Ben", card: 1 } });
    expect(data.classes.math8.studentIds).toEqual(["b", "a"]);
    expect(changes).toEqual(["Ava: kept #7 (was #9 in 8th Math).", "Ben: now #1 (was #7, which Ava keeps)."]);
  });
  it("keeps every answer when ids are merged, across all sets and classes", () => {
    const b = v1({
      math7: cls("7th Math", 1, [{ id: "x1", name: "Kim", card: 3 }]),
      earth: cls("Earth Science", 3, [{ id: "x2", name: "kim", card: 8 }]),
    }, {
      math7: { m: { title: "M", date: "2026-11-02", questions: [{ correct: "A" }], answers: { 0: { x1: "A" } } } },
      earth: { e: { title: "E", date: "2026-11-03", questions: [{ correct: "B" }, { correct: "C" }], answers: { 0: { x2: "B" }, 1: { x2: "D" } } } },
    });
    const { data } = migrateV1(b);
    expect(data.sets.math7.m.answers).toEqual({ 0: { x1: "A" } });
    expect(data.sets.earth.e.answers).toEqual({ 0: { x1: "B" }, 1: { x1: "D" } });
  });
  it("leaves no duplicate card numbers", () => {
    const students = Array.from({ length: 10 }, (_, i) => ({ id: "s" + i, name: "S" + i, card: 1 + (i % 3) }));
    const { data } = migrateV1(v1({ math7: cls("7th Math", 1, students) }));
    const nums = Object.values(data.students).map(s => s.card);
    expect(new Set(nums).size).toBe(10);
  });
});
