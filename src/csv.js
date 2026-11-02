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

// Reads CSV text from Excel or Google Sheets: byte-order mark, quoted fields with commas, quotes and
// line breaks, ";" separators (non-US Excel), \r\n or \n. Returns rows of cells; blank rows are kept
// as [] so row numbers match the spreadsheet (row 1 is the header).
export function parseCSV(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const sep = guessSeparator(s);
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row.every(c => c.trim() === "") ? [] : row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row.every(c => c.trim() === "") ? [] : row); }
  while (rows.length && !rows[rows.length - 1].length) rows.pop(); // trailing empty rows
  return rows;
}

// The header line decides: more ";" than "," outside quotes means a semicolon file.
function guessSeparator(s) {
  let q = false, commas = 0, semis = 0;
  for (const ch of s) {
    if (ch === '"') q = !q;
    else if (!q && (ch === "\n" || ch === "\r")) break;
    else if (!q && ch === ",") commas++;
    else if (!q && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

// Question file format (BUILD_BRIEF section 3), so a downloaded file uploads again unchanged.
export const QUESTION_COLUMNS = ["class", "date", "set_title", "question_number", "question", "choice_a", "choice_b", "choice_c", "choice_d", "correct"];
export function questionsCSV(entries) { // entries: [{ className, set }]
  const rows = [QUESTION_COLUMNS];
  for (const { className, set } of entries) (set.questions || []).forEach((q, i) => {
    const ch = q.choices || [];
    rows.push([className, set.date, set.title, i + 1, q.text || "", ch[0] || "", ch[1] || "", ch[2] || "", ch[3] || "", q.correct === "ANY" ? "Survey" : q.correct || ""]);
  });
  return "﻿" + toCSV(rows) + "\r\n"; // the byte-order mark makes Excel read "—" and "′" correctly
}
