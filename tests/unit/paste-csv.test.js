import { describe, it, expect } from "vitest";
import { parsePaste } from "../../src/paste.js";
import { csvCell, scoresCSV, answersCSV } from "../../src/csv.js";

describe("question paste parser", () => {
  it("reads numbered questions with CORRECT lines", () => {
    const txt = "1. Which point is the center?\n   A. point A\n   CORRECT: C\n2) Second one\ncorrect = b";
    expect(parsePaste(txt)).toEqual([{ text: "Which point is the center?", correct: "C" }, { text: "Second one", correct: "B" }]);
  });
  it("reads plain letters", () => {
    expect(parsePaste("B A c, D")).toEqual(["B", "A", "C", "D"].map(correct => ({ text: "", correct })));
  });
  it("returns nothing for text without questions or letters", () => {
    expect(parsePaste("hello there")).toEqual([]);
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Okafor, Ben')).toBe('"Okafor, Ben"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
  });
  const sts = [{ id: "a", name: "Ava", card: 1 }, { id: "b", name: "Ben", card: 2 }];
  const sets = [{ date: "2026-11-02", title: "L1", questions: [{ text: "2+2", correct: "A" }, { text: "", correct: "ANY" }], answers: { 0: { a: "A" }, 1: { a: "C" } } }];
  it("exports scores", () => {
    expect(scoresCSV(sets, sts).split("\r\n")).toEqual([
      "Student,Card,2026-11-02 L1,Overall %,Points /10", "Ava,1,1/1,100,10.0", "Ben,2,absent,,",
    ]);
  });
  it("exports every answer", () => {
    const lines = answersCSV(sets, sts).split("\r\n");
    expect(lines[1]).toBe("2026-11-02,L1,Q1: 2+2,A,Ava,1,A,correct");
    expect(lines[2]).toBe("2026-11-02,L1,Q1: 2+2,A,Ben,2,,no answer");
    expect(lines[3]).toBe("2026-11-02,L1,Q2,survey,Ava,1,C,participated");
  });
});
