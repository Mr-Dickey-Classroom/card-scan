import { reportRows } from "./scoring.js";

export function csvCell(v) { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
export function toCSV(rows) { return rows.map(r => r.map(csvCell).join(",")).join("\r\n"); }

export function scoresCSV(sets, students) {
  const rows = [["Student", "Card", ...sets.map(s => `${s.date} ${s.title}`), "Overall %", "Points /10"]];
  for (const r of reportRows(sets, students))
    rows.push([r.student.name, r.student.card, ...r.cells.map(x => !x ? "absent" : x.graded ? `${x.correct}/${x.graded}` : "participated"),
      r.pct ?? "", r.points === null ? "" : r.points.toFixed(1)]);
  return toCSV(rows);
}

export function answersCSV(sets, students) {
  const rows = [["Date", "Set", "Question", "Correct answer", "Student", "Card", "Answer", "Result"]];
  for (const s of sets) (s.questions || []).forEach((q, i) => {
    for (const st of students) {
      const a = s.answers?.[i]?.[st.id] || "";
      const result = !a ? "no answer" : q.correct === "ANY" ? "participated" : q.correct ? (a === q.correct ? "correct" : "incorrect") : "";
      rows.push([s.date, s.title, `Q${i + 1}${q.text ? ": " + q.text : ""}`, q.correct === "ANY" ? "survey" : q.correct, st.name, st.card, a, result]);
    }
  });
  return toCSV(rows);
}
