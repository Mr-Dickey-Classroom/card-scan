import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCSV, questionsCSV } from "../../src/csv.js";
import { planQuestions, applyQuestions, planRoster, applyRoster, parseDate, parseCorrect } from "../../src/upload.js";
import { emptyData } from "../../src/model.js";

const file = n => readFileSync(new URL(`../../reference/csv/${n}`, import.meta.url), "utf8");
const HEAD = "class,date,set_title,question_number,question,choice_a,choice_b,choice_c,choice_d,correct";

describe("CSV reader", () => {
  it("handles Excel's byte-order mark, quoted commas, quotes and line breaks", () => {
    const t = '﻿a,b,c\r\n"Okafor, Ben","say ""hi""","line one\r\nline two"\r\n';
    expect(parseCSV(t)).toEqual([["a", "b", "c"], ["Okafor, Ben", 'say "hi"', "line one\r\nline two"]]);
  });
  it("reads semicolon files from non-US Excel", () => {
    expect(parseCSV("name;card\n\"Ruiz; Carla\";3\n")).toEqual([["name", "card"], ["Ruiz; Carla", "3"]]);
  });
  it("drops trailing empty rows but keeps row numbers for blank rows in the middle", () => {
    expect(parseCSV("a,b\n1,2\n,\n3,4\n,,\n\n")).toEqual([["a", "b"], ["1", "2"], [], ["3", "4"]]);
  });
});

describe("question upload: field rules", () => {
  it("accepts three date styles and rejects impossible dates", () => {
    expect(parseDate("2026-11-09")).toBe("2026-11-09");
    expect(parseDate("11/9/2026")).toBe("2026-11-09");
    expect(parseDate("11/9/26")).toBe("2026-11-09");
    expect(parseDate("2/30/2026")).toBe(null);
    expect(parseDate("Nov 9")).toBe(null);
  });
  it("accepts A–D in any case and Survey/S/Any/blank as survey", () => {
    expect(["a", "B", " c ", "d"].map(parseCorrect)).toEqual(["A", "B", "C", "D"]);
    expect(["Survey", "s", "any", ""].map(parseCorrect)).toEqual(["ANY", "ANY", "ANY", "ANY"]);
    expect(parseCorrect("E")).toBe(null);
  });
});

describe("question upload: the real files in reference/csv", () => {
  it("7th grade: 4 sets, 20 questions, no problems", () => {
    const p = planQuestions(file("questions_7th_math_week_of_11-2.csv"), emptyData(), "math8");
    expect(p.problems).toEqual([]);
    expect(p.unknownClasses).toEqual([]);
    expect([p.sets.length, p.questionCount]).toEqual([4, 20]);
    expect(p.sets.map(s => [s.classId, s.date, s.questions.length])).toEqual([
      ["math7", "2026-11-02", 4], ["math7", "2026-11-03", 4], ["math7", "2026-11-05", 4], ["math7", "2026-11-06", 8]]);
    const quiz = p.sets[3];
    expect(quiz.title).toBe("Checkpoint quiz — Sections A, B, C");
    expect(quiz.questions[0].choices).toEqual(["21", "8", "72", "3"]);
    expect(p.sets[0].questions[3].correct).toBe("ANY");
    expect(p.sets[0].questions[1].text).toBe("In the equation y = 4x, what is y when x = 2.5?");
  });
  it("8th grade: 4 sets, 16 questions, no problems", () => {
    const p = planQuestions(file("questions_8th_math_week_of_11-2.csv"), emptyData(), "math7");
    expect(p.problems).toEqual([]);
    expect([p.sets.length, p.questionCount]).toEqual([4, 16]);
    expect(p.sets.every(s => s.classId === "math8")).toBe(true);
    expect(p.sets[0].questions[1].choices).toEqual(["(3, −2)", "(12, −8)", "(6.5, −3.5)", "(−3, 2)"]);
  });
  it("template: 1 set, 2 questions, a blank choice stays blank", () => {
    const p = planQuestions(file("questions_TEMPLATE.csv"), emptyData(), "math7");
    expect(p.problems).toEqual([]);
    expect([p.sets.length, p.questionCount]).toEqual([1, 2]);
    expect(p.sets[0].questions[1]).toEqual({ text: "A survey question has no right answer", correct: "ANY", choices: ["Yes", "No", "Not sure", ""] });
  });
});

describe("question upload: problems and choices", () => {
  it("a bad correct value is listed with its row number, and the other rows still import", () => {
    const t = [HEAD, "8th Math,2026-11-09,L10,1,Q1,,,,,B", "8th Math,2026-11-09,L10,2,Q2,,,,,E", "8th Math,2026-11-09,L10,3,Q3,,,,,c"].join("\n");
    const p = planQuestions(t, emptyData(), "math8");
    expect(p.problems.map(x => x.msg)).toEqual(["Row 3: correct answer “E” isn't A–D or Survey."]);
    expect(p.sets[0].questions.map(q => q.correct)).toEqual(["B", "C"]);
  });
  it("a file saved by Excel (byte-order mark, quoted commas, CRLF, trailing blank rows) imports", () => {
    const t = "﻿" + [HEAD, '8th Math,11/9/26,"Bell work — L10, part 2",2,"Is (6, −4) in Quadrant IV?",Yes,No,,,a', '8th Math,11/9/2026,"Bell work — L10, part 2",1,"Which is bigger, 2 or 3?",2,3,,,B', ",,,,,,,,,", ""].join("\r\n");
    const p = planQuestions(t, emptyData(), "math7");
    expect(p.problems).toEqual([]);
    expect(p.sets).toHaveLength(1);
    expect(p.sets[0].title).toBe("Bell work — L10, part 2");
    expect(p.sets[0].questions.map(q => q.text)).toEqual(["Which is bigger, 2 or 3?", "Is (6, −4) in Quadrant IV?"]);
    expect(p.sets[0].questions[1].choices).toEqual(["Yes", "No", "", ""]);
  });
  it("a file with only question and correct goes to the open class, dated today", () => {
    const p = planQuestions("Question,Correct\nWhat is 2+2?,b\nHow are you?,\n", emptyData(), "earth");
    expect(p.sets).toHaveLength(1);
    expect(p.sets[0]).toMatchObject({ classId: "earth", title: "Bell work" });
    expect(p.sets[0].questions).toEqual([{ text: "What is 2+2?", correct: "B" }, { text: "How are you?", correct: "ANY" }]);
  });
  it("asks about a class it doesn't recognize instead of guessing, then uses the teacher's choice", () => {
    const t = [HEAD, "Math 8,2026-11-09,L10,1,Q1,,,,,B", "8th math,2026-11-09,L10,1,Q1,,,,,B"].join("\n");
    const p = planQuestions(t, emptyData(), "math7");
    expect(p.unknownClasses).toEqual(["Math 8"]);
    expect(p.sets.map(s => s.classId)).toEqual(["math8"]); // "8th math" matches ignoring case
    const p2 = planQuestions(t, emptyData(), "math7", { "Math 8": "math8" });
    expect(p2.unknownClasses).toEqual([]);
    expect(p2.sets[0].questions).toHaveLength(1);
    expect(p2.problems[0].msg).toMatch(/question 1 is in “L10” twice/);
    expect(planQuestions(t, emptyData(), "math7", { "Math 8": "" }).sets[0].questions).toHaveLength(1);
  });
  it("lists bad dates, missing columns and empty files", () => {
    expect(planQuestions([HEAD, "8th Math,13/45/26,L,1,Q,,,,,A"].join("\n"), emptyData(), "math8").problems[0].msg).toMatch(/^Row 2: date “13\/45\/26” isn't a date/);
    expect(planQuestions("name,card\nAva,1", emptyData(), "math8").error).toMatch(/question/);
    expect(planQuestions("", emptyData(), "math8").error).toBe("That file is empty.");
  });
});

describe("question upload: re-uploading a set that already exists", () => {
  const t = [HEAD, "8th Math,2026-11-09,Bell work — L10,1,Fixed question,,,,,C", "8th Math,2026-11-09,Bell work — L10,2,New Q2,,,,,A"].join("\n");
  const withScanned = () => {
    const d = emptyData();
    d.sets.math8 = { old: { title: "bell work — l10", date: "2026-11-09", questions: [{ text: "Typo", correct: "B" }], answers: { 0: { s1: "C" } }, created: 1, updated: 1 } };
    return d;
  };
  it("finds the existing set and says it has scanned answers", () => {
    const p = planQuestions(t, withScanned(), "math8");
    expect(p.sets[0]).toMatchObject({ existingId: "old", existingAnswered: 1 });
  });
  it("does nothing to it until the teacher chooses", () => {
    const d = withScanned(), p = planQuestions(t, d, "math8");
    expect(applyQuestions(d, p, {})).toMatchObject({ added: 0, replaced: 0, skipped: 1 });
    expect(Object.keys(d.sets.math8)).toEqual(["old"]);
    expect(d.sets.math8.old.questions[0].text).toBe("Typo");
  });
  it("Replace swaps the questions and keeps the scanned answers", () => {
    const d = withScanned(), p = planQuestions(t, d, "math8");
    expect(applyQuestions(d, p, { [p.sets[0].key]: "replace" })).toMatchObject({ replaced: 1, questions: 2 });
    expect(Object.keys(d.sets.math8)).toEqual(["old"]);
    expect(d.sets.math8.old.questions.map(q => q.text)).toEqual(["Fixed question", "New Q2"]);
    expect(d.sets.math8.old.answers).toEqual({ 0: { s1: "C" } });
  });
  it("Keep both adds a second set and leaves the first alone", () => {
    const d = withScanned(), p = planQuestions(t, d, "math8");
    expect(applyQuestions(d, p, { [p.sets[0].key]: "keep" })).toMatchObject({ added: 1 });
    expect(Object.keys(d.sets.math8)).toHaveLength(2);
    expect(d.sets.math8.old.questions[0].text).toBe("Typo");
  });
});

describe("question download round-trips", () => {
  it("a downloaded file uploads back to the same sets", () => {
    const d = emptyData(), p = planQuestions(file("questions_7th_math_week_of_11-2.csv"), d, "math7");
    applyQuestions(d, p);
    const out = questionsCSV(Object.values(d.sets.math7).map(set => ({ className: "7th Math", set })));
    const p2 = planQuestions(out, emptyData(), "math8");
    expect(p2.problems).toEqual([]);
    expect(p2.sets.map(s => [s.date, s.title, s.questions])).toEqual(p.sets.map(s => [s.date, s.title, s.questions]));
  });
});

describe("roster upload", () => {
  const base = () => {
    const d = emptyData();
    d.students = { a: { name: "Ava Martinez", card: 1 }, b: { name: "Ben Okafor", card: 2 } };
    d.classes.math7.studentIds = ["a", "b"];
    return d;
  };
  it("new names get the lowest free number; a student in another class keeps theirs", () => {
    const d = base(), p = planRoster("name\nben okafor\nZoe Park\n", d, "jhsci");
    expect(p.rows.map(r => [r.name, r.action, r.card ?? r.student?.card])).toEqual([["ben okafor", "enroll", 2], ["Zoe Park", "new", 3]]);
    applyRoster(d, p);
    expect(d.classes.jhsci.studentIds).toEqual(["b", expect.any(String)]);
    expect(Object.values(d.students).map(s => s.card).sort()).toEqual([1, 2, 3]);
  });
  it("a requested card that belongs to someone else is flagged, not applied", () => {
    const d = base(), p = planRoster("name,card\nZoe Park,2\nEli Chen,7\nBen Okafor,9\n", d, "math7");
    expect(p.problems.map(x => x.msg)).toEqual([
      "Row 2: card #2 belongs to Ben Okafor, so Zoe Park gets the next free number.",
      "Row 4: Ben Okafor keeps card #2 (the file says #9).",
    ]);
    expect(p.rows.map(r => [r.name, r.action, r.card ?? null])).toEqual([["Zoe Park", "new", 3], ["Eli Chen", "new", 7], ["Ben Okafor", "already", null]]);
    applyRoster(d, p);
    expect(d.students.b.card).toBe(2);
  });
  it("a requested number wins over lowest-free numbers given to earlier rows", () => {
    const p = planRoster("name,card\nZoe Park,\nEli Chen,1\n", emptyData(), "math7");
    expect(p.rows.map(r => r.card)).toEqual([2, 1]);
  });
  it("a class column puts one new student in two classes with one card", () => {
    const d = emptyData(), p = planRoster("name,class\nIvy Lee,7th Math\nIvy Lee,jh science\nJo Kim,Robotics\n", d, "math8");
    expect(p.unknownClasses).toEqual(["Robotics"]);
    applyRoster(d, p);
    expect(Object.values(d.students)).toEqual([{ name: "Ivy Lee", card: 1 }]);
    expect(d.classes.math7.studentIds).toEqual(d.classes.jhsci.studentIds);
  });
  it("Different student gives a same-named person their own card", () => {
    const d = base(), p = planRoster("name\nAva Martinez\n", d, "jhsci", {}, { 2: "new" });
    expect(p.rows[0]).toMatchObject({ action: "new", card: 3 });
  });
  it("needs a name column", () => {
    expect(planRoster("student,card\nAva,1", emptyData(), "math7").error).toMatch(/name/);
  });
});
