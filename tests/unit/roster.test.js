import { describe, it, expect } from "vitest";
import { emptyData } from "../../src/model.js";
import { planAdd, applyAdd, classStudents, setCard, matchCard, unenroll, deleteStudent, enroll, notInClass, lowestFreeCard, parseNames, shortName } from "../../src/roster.js";

const add = (data, cls, names) => applyAdd(data, cls, planAdd(data, cls, names));
const cards = (data, cls) => classStudents(data, cls).map(s => [s.name, s.card]);

describe("one student list, one card number per student", () => {
  it("gives new names the lowest free numbers", () => {
    const d = emptyData();
    add(d, "math7", ["Ava Martinez", "Ben Okafor"]);
    expect(cards(d, "math7")).toEqual([["Ava Martinez", 1], ["Ben Okafor", 2]]);
  });
  it("keeps a student's number when they're added to another class (case and spacing ignored)", () => {
    const d = emptyData();
    add(d, "math7", ["Ava Martinez", "Ben Okafor"]);
    add(d, "math8", ["Cara Lee"]);
    const r = add(d, "jhsci", ["  ben   OKAFOR ", "Dev Patel"]);
    expect(r.enrolled.map(s => [s.name, s.card])).toEqual([["Ben Okafor", 2]]);
    expect(cards(d, "jhsci")).toEqual([["Ben Okafor", 2], ["Dev Patel", 4]]);
    expect(Object.keys(d.students)).toHaveLength(4);
  });
  it("never gives two students the same number, across all classes", () => {
    const d = emptyData();
    add(d, "math7", ["A1", "A2", "A3"]);
    add(d, "math8", ["B1", "B2"]);
    add(d, "earth", ["C1", "A2"]);
    const nums = Object.values(d.students).map(s => s.card);
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("fills a gap left by a deleted student", () => {
    const d = emptyData();
    add(d, "math7", ["A", "B", "C"]);
    deleteStudent(d, classStudents(d, "math7")[1].id);
    expect(lowestFreeCard(d.students)).toBe(2);
  });
  it("lets the teacher say a matching name is a different student", () => {
    const d = emptyData();
    add(d, "math7", ["Sam Lee"]);
    const plan = planAdd(d, "math8", ["Sam Lee"]);
    expect(plan[0].match).toHaveLength(1);
    plan[0].choice = "new";
    applyAdd(d, "math8", plan);
    expect(cards(d, "math8")).toEqual([["Sam Lee", 2]]);
    expect(Object.keys(d.students)).toHaveLength(2);
  });
  it("reports a name already in this class instead of adding it twice", () => {
    const d = emptyData();
    add(d, "math7", ["Ava"]);
    const r = add(d, "math7", ["ava"]);
    expect(r.already).toHaveLength(1);
    expect(d.classes.math7.studentIds).toHaveLength(1);
  });
  it("stops at 40 cards", () => {
    const d = emptyData();
    add(d, "math7", Array.from({ length: 40 }, (_, i) => `S${i + 1}`));
    const r = add(d, "math8", ["One Too Many"]);
    expect(r.full).toEqual(["One Too Many"]);
  });
});

describe("changing card numbers", () => {
  it("changes the number everywhere", () => {
    const d = emptyData();
    add(d, "math7", ["Ava"]); add(d, "jhsci", ["Ava"]);
    const id = d.classes.math7.studentIds[0];
    expect(setCard(d, id, 12).ok).toBe(true);
    expect(cards(d, "math7")).toEqual([["Ava", 12]]);
    expect(cards(d, "jhsci")).toEqual([["Ava", 12]]);
  });
  it("blocks a number that's taken and says who has it", () => {
    const d = emptyData();
    add(d, "math7", ["Ava"]); add(d, "math8", ["Ben"]);
    const r = setCard(d, d.classes.math7.studentIds[0], 2);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Card #2 belongs to Ben.");
  });
  it("refuses numbers outside 1–40", () => {
    const d = emptyData(); add(d, "math7", ["Ava"]);
    expect(setCard(d, d.classes.math7.studentIds[0], 41).ok).toBe(false);
    expect(setCard(d, d.classes.math7.studentIds[0], 0).ok).toBe(false);
  });
});

describe("classes", () => {
  it("removing from a class keeps the student and their number", () => {
    const d = emptyData();
    add(d, "math7", ["Ava"]); add(d, "jhsci", ["Ava"]);
    const id = d.classes.math7.studentIds[0];
    unenroll(d, "math7", id);
    expect(d.students[id]).toEqual({ name: "Ava", card: 1 });
    expect(cards(d, "jhsci")).toEqual([["Ava", 1]]);
  });
  it("matches a scanned card only against students enrolled in the class", () => {
    const d = emptyData();
    add(d, "math7", ["Ana Rivera"]); add(d, "math8", ["Ben"]);
    expect(matchCard(d, "math8", 1)).toMatchObject({ student: { name: "Ana Rivera" }, enrolled: false });
    expect(matchCard(d, "math8", 2)).toMatchObject({ enrolled: true });
    expect(matchCard(d, "math8", 9)).toEqual({ student: null, enrolled: false });
  });
  it("lists and adds existing students not yet in a class", () => {
    const d = emptyData();
    add(d, "math7", ["Ava", "Ben"]); add(d, "math8", ["Cal"]);
    const list = notInClass(d, "jhsci");
    expect(list.map(s => s.name)).toEqual(["Ava", "Ben", "Cal"]);
    enroll(d, "jhsci", [list[0].id, list[2].id]);
    expect(cards(d, "jhsci")).toEqual([["Ava", 1], ["Cal", 3]]);
  });
});

describe("names", () => {
  it("parses pasted names, dropping numbering and blank lines", () => {
    expect(parseNames("1. Ava  Martinez\n\n2) Ben\tOkafor\r\nCal")).toEqual(["Ava Martinez", "Ben Okafor", "Cal"]);
  });
  it("shortens names", () => {
    expect(shortName("Ana Rivera")).toBe("Ana R.");
    expect(shortName("Cher")).toBe("Cher");
  });
});
