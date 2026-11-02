import { describe, it, expect } from "vitest";
import { scoreSet, setPct, reportRows, reportSets, reteachList, weekBounds } from "../../src/scoring.js";

const sts = [{ id: "a", name: "Ava", card: 1 }, { id: "b", name: "Ben", card: 2 }, { id: "c", name: "Cal", card: 3 }];
const set = {
  title: "L1", date: "2026-11-02",
  questions: [{ correct: "A" }, { correct: "B" }, { correct: "ANY" }, { correct: "C" }],
  // Q4 (index 3) was never scanned
  answers: { 0: { a: "A", b: "C" }, 1: { a: "B" }, 2: { a: "D", b: "A" } },
};

describe("scoring rules", () => {
  it("scores correct/graded and leaves out questions nobody was scanned on", () => {
    expect(scoreSet(set, "a")).toEqual({ correct: 2, graded: 2, answered: 3 });
  });
  it("counts a missed question as wrong when the student was present", () => {
    expect(scoreSet(set, "b")).toEqual({ correct: 0, graded: 2, answered: 2 });
  });
  it("marks a student with no answers in the set as absent", () => {
    expect(scoreSet(set, "c").answered).toBe(0);
    expect(reportRows([set], sts)[2]).toMatchObject({ cells: [null], pct: null, points: null });
  });
  it("counts Survey questions as participation only", () => {
    const survey = { questions: [{ correct: "ANY" }], answers: { 0: { a: "C" } } };
    expect(scoreSet(survey, "a")).toEqual({ correct: 0, graded: 0, answered: 1 });
  });
  it("ignores questions with no correct answer set yet", () => {
    const s = { questions: [{ correct: "" }, { correct: "A" }], answers: { 0: { a: "B" }, 1: { a: "A" } } };
    expect(scoreSet(s, "a")).toEqual({ correct: 1, graded: 1, answered: 2 });
  });
  it("gives an overall % and points out of 10 across sets", () => {
    const set2 = { date: "2026-11-03", questions: [{ correct: "D" }, { correct: "D" }], answers: { 0: { a: "D", b: "D" }, 1: { a: "A", b: "D" } } };
    const [a, b] = reportRows([set, set2], sts);
    expect(a).toMatchObject({ correct: 3, graded: 4, pct: 75, points: 7.5 });
    expect(b).toMatchObject({ correct: 2, graded: 4, pct: 50, points: 5 });
  });
  it("averages a set over present students only", () => {
    expect(setPct(set, sts)).toBe(50); // Ava 2/2, Ben 0/2, Cal absent
  });
  it("lists questions to reteach, lowest first, skipping surveys and unscanned questions", () => {
    const r = reteachList([set], sts);
    expect(r.map(x => [x.q, x.pct])).toEqual([[0, 50], [1, 100]]);
  });
});

describe("report ranges", () => {
  const sets = { s1: { date: "2026-10-26" }, s2: { date: "2026-11-02" }, s3: { date: "2026-11-06" }, s4: { date: "2026-11-09" } };
  it("finds Monday to Sunday", () => {
    expect(weekBounds(0, "2026-11-04")).toEqual(["2026-11-02", "2026-11-08"]);
    expect(weekBounds(-1, "2026-11-04")).toEqual(["2026-10-26", "2026-11-01"]);
    expect(weekBounds(0, "2026-11-08")).toEqual(["2026-11-02", "2026-11-08"]);
  });
  it("filters this week, last week, all, and chosen sets (oldest first)", () => {
    const ids = r => r.map(s => s.id);
    expect(ids(reportSets(sets, "week", [], "2026-11-04"))).toEqual(["s2", "s3"]);
    expect(ids(reportSets(sets, "last", [], "2026-11-04"))).toEqual(["s1"]);
    expect(ids(reportSets(sets, "all"))).toEqual(["s1", "s2", "s3", "s4"]);
    expect(ids(reportSets(sets, "pick", ["s4", "s1"]))).toEqual(["s1", "s4"]);
  });
});
