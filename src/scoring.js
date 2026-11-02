// Report rules (BUILD_BRIEF section 3):
// - questions nobody was scanned on are left out
// - a student with no answers in a set is absent and left out of that set
// - a missed question on a day the student was present counts as wrong
// - Survey ("ANY") questions count as participation only
import { todayISO } from "./model.js";

export function scoreSet(set, sid) {
  let correct = 0, graded = 0, answered = 0;
  (set.questions || []).forEach((q, i) => {
    const qa = set.answers?.[i] || {};
    if (!Object.keys(qa).length) return;
    const a = qa[sid];
    if (a) answered++;
    if (q.correct && q.correct !== "ANY") { graded++; if (a === q.correct) correct++; }
  });
  return { correct, graded, answered };
}

// Class average for one set, over present students. null when nothing is graded.
export function setPct(set, students) {
  let c = 0, g = 0;
  for (const st of students) { const s = scoreSet(set, st.id); if (s.answered) { c += s.correct; g += s.graded; } }
  return g ? Math.round(100 * c / g) : null;
}

export function qProgress(set, i, students) {
  if (!students.length) return 0;
  const a = set.answers?.[i] || {};
  return students.filter(s => a[s.id]).length / students.length;
}

// Monday–Sunday of this week (offset 0) or an earlier one (offset -1 = last week).
export function weekBounds(offset = 0, today = todayISO()) {
  const d = new Date(today + "T12:00:00"); const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offset * 7);
  const end = new Date(d); end.setDate(end.getDate() + 6);
  return [todayISO(d), todayISO(end)];
}

// Sets newest first.
export const sortSets = sets => Object.entries(sets || {}).map(([id, s]) => ({ id, ...s }))
  .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0));

// Sets for a report range, oldest first. range: "week" | "last" | "all" | "pick".
export function reportSets(sets, range, chosen = [], today = todayISO()) {
  const all = sortSets(sets).reverse();
  if (range === "pick") return all.filter(s => chosen.includes(s.id));
  if (range === "all") return all;
  const [a, b] = weekBounds(range === "last" ? -1 : 0, today);
  return all.filter(s => s.date >= a && s.date <= b);
}

// One row per student: per-set cells (null = absent), overall %, points out of 10.
export function reportRows(sets, students) {
  return students.map(st => {
    let c = 0, g = 0;
    const cells = sets.map(s => { const x = scoreSet(s, st.id); if (!x.answered) return null; c += x.correct; g += x.graded; return x; });
    const pct = g ? Math.round(100 * c / g) : null;
    return { student: st, cells, correct: c, graded: g, pct, points: pct === null ? null : +(pct / 10).toFixed(1) };
  });
}

// Percent correct per graded question, among students who answered it. Lowest first.
export function reteachList(sets, students) {
  const out = [];
  for (const s of sets) (s.questions || []).forEach((q, i) => {
    if (!q.correct || q.correct === "ANY") return;
    const a = s.answers?.[i] || {}; const ans = students.filter(x => a[x.id]);
    if (!ans.length) return;
    out.push({ set: s, q: i, text: q.text, pct: Math.round(100 * ans.filter(x => a[x.id] === q.correct).length / ans.length), n: ans.length });
  });
  return out.sort((x, y) => x.pct - y.pct);
}
