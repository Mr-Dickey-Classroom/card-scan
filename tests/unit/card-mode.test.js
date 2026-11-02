import { describe, it, expect } from "vitest";
import { emptyData } from "../../src/model.js";
import { planAdd, applyAdd, classStudents, setCard, matchCard, notInClass, setCardMode, cardHolders, perClass } from "../../src/roster.js";
import { planRoster, applyRoster } from "../../src/upload.js";
import { buildBackup, readBackup } from "../../src/backup.js";

const add = (d, cls, names) => applyAdd(d, cls, planAdd(d, cls, names));
const cards = (d, cls) => classStudents(d, cls).map(s => [s.name, s.card]);
const names = (n, p) => Array.from({ length: n }, (_, i) => `${p} Student${i + 1}`);

describe("card numbers per class (for teachers with more than 40 students)", () => {
  it("is off by default: one number per student across the app", () => {
    const d = emptyData();
    expect(perClass(d)).toBe(false);
    add(d, "math7", ["Ava Martinez"]); add(d, "math8", ["Ben Okafor"]);
    expect(cards(d, "math8")).toEqual([["Ben Okafor", 2]]);
  });
  it("each class starts at card 1, and 40 students fit in every class", () => {
    const d = emptyData(); setCardMode(d, "class");
    add(d, "math7", names(40, "Seventh")); add(d, "math8", names(40, "Eighth"));
    expect(cards(d, "math7").map(r => r[1])).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(cards(d, "math8").map(r => r[1])).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(add(d, "math8", ["One More"]).full).toEqual(["One More"]);
  });
  it("a scanned card matches only the student in this class", () => {
    const d = emptyData(); setCardMode(d, "class");
    add(d, "math7", ["Ava Martinez"]); add(d, "math8", ["Ben Okafor"]);
    expect(matchCard(d, "math7", 1)).toMatchObject({ student: { name: "Ava Martinez" }, enrolled: true });
    expect(matchCard(d, "math8", 1)).toMatchObject({ student: { name: "Ben Okafor" }, enrolled: true });
    expect(matchCard(d, "earth", 1)).toEqual({ student: null, enrolled: false });
  });
  it("the same name in another class is a separate student, and there's no one to 'add existing'", () => {
    const d = emptyData(); setCardMode(d, "class");
    add(d, "math7", ["Ava Martinez", "Ben Okafor"]); add(d, "math8", ["Ben Okafor"]);
    expect(Object.keys(d.students)).toHaveLength(3);
    expect(cards(d, "math8")).toEqual([["Ben Okafor", 1]]);
    expect(planAdd(d, "math8", ["ben okafor"])[0].inClass).toBeTruthy();
    expect(notInClass(d, "math8")).toEqual([]);
  });
  it("changing a number is blocked only by someone in the same class", () => {
    const d = emptyData(); setCardMode(d, "class");
    add(d, "math7", ["Ava Martinez", "Ben Okafor"]); add(d, "math8", ["Carla Ruiz", "Dev Patel"]);
    const dev = classStudents(d, "math8")[1].id;
    expect(setCard(d, dev, 2).ok).toBe(true);
    expect(setCard(d, dev, 1)).toMatchObject({ ok: false, reason: "Card #1 belongs to Carla Ruiz." });
    expect([...cardHolders(d, dev)]).toEqual([[1, "Carla Ruiz"]]);
  });
  it("going back to one number per student is refused while numbers are shared, and says who", () => {
    const d = emptyData(); setCardMode(d, "class");
    add(d, "math7", ["Ava Martinez"]); add(d, "math8", ["Ben Okafor"]);
    expect(setCardMode(d, "app")).toEqual({ ok: false, dups: ["#1: Ava Martinez, Ben Okafor"] });
    expect(perClass(d)).toBe(true);
    setCard(d, classStudents(d, "math8")[0].id, 2);
    expect(setCardMode(d, "app").ok).toBe(true);
    expect(perClass(d)).toBe(false);
  });
  it("roster files number each class separately", () => {
    const d = emptyData(); setCardMode(d, "class");
    add(d, "math8", ["Dev Patel"]);
    const p = planRoster("name,class,card\nAva Martinez,7th Math,\nBen Okafor,8th Math,\nCarla Ruiz,8th Math,1\nAva Martinez,8th Math,\nEli Chen,7th Math,1\n", d, "math7");
    expect(p.problems.map(x => x.msg)).toEqual(["Row 4: card #1 belongs to Dev Patel, so Carla Ruiz gets the next free number."]);
    applyRoster(d, p);
    expect(cards(d, "math7")).toEqual([["Eli Chen", 1], ["Ava Martinez", 2]]);
    expect(cards(d, "math8")).toEqual([["Dev Patel", 1], ["Ben Okafor", 2], ["Carla Ruiz", 3], ["Ava Martinez", 4]]);
  });
  it("the setting is kept in backups", () => {
    const d = emptyData(); setCardMode(d, "class");
    expect(perClass(readBackup(JSON.stringify(buildBackup(d))).data)).toBe(true);
  });
});
