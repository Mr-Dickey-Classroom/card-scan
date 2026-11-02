// CSV uploads (BUILD_BRIEF section 3): question files and roster files. Each has a "plan" step that
// changes nothing and says what will happen (for the preview), and an "apply" step.
import { parseCSV } from "./csv.js";
import { MAX_CARDS } from "./detect.js";
import { uid, todayISO } from "./model.js";
import { normName, studentsByName, studentByCard } from "./roster.js";

const header = row => row.map(h => String(h).trim().toLowerCase().replace(/[\s-]+/g, "_"));

// Class name in a file → class id, ignoring case and extra spaces. null when not recognized.
export function findClass(data, name) {
  const n = normName(name);
  const e = Object.entries(data.classes).find(([, c]) => normName(c.name) === n);
  return e ? e[0] : null;
}

// "2026-11-09", "11/9/2026" or "11/9/26" → "2026-11-09". null if it isn't a real date.
export function parseDate(s) {
  s = String(s ?? "").trim();
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) [m, d, y] = [+x[1], +x[2], x[3].length === 2 ? 2000 + +x[3] : +x[3]];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

// A–D in either case; Survey, S, Any or blank all mean survey ("ANY"). null if not allowed.
export function parseCorrect(s) {
  const v = String(s ?? "").trim().toUpperCase();
  if (/^[ABCD]$/.test(v)) return v;
  if (v === "" || v === "SURVEY" || v === "S" || v === "ANY") return "ANY";
  return null;
}

// ---------- questions ----------
// classMap: { "name in file": classId or "" (skip) } for class names the app doesn't recognize.
// Returns { error } or { sets, problems, unknownClasses, questionCount }.
// sets: [{ key, classId, className, date, title, questions, existingId, existingAnswered }]
export function planQuestions(text, data, openClassId, classMap = {}) {
  const rows = parseCSV(text);
  if (!rows.length) return { error: "That file is empty." };
  const h = header(rows[0]), col = n => h.indexOf(n);
  if (col("question") < 0 && col("correct") < 0)
    return { error: "The first row of the file needs column names, with at least “question” and “correct”. Download the template to see the format." };
  const has = n => col(n) >= 0;
  const problems = [], unknown = new Set(), groups = new Map();
  rows.forEach((row, r) => {
    if (r === 0 || !row.length) return;
    const rowNo = r + 1, get = n => has(n) ? String(row[col(n)] ?? "").trim() : "";
    const bad = msg => problems.push({ row: rowNo, msg: `Row ${rowNo}: ${msg}` });

    let classId = openClassId, className = data.classes[openClassId]?.name || "";
    if (has("class")) {
      className = get("class");
      if (!className) return bad("no class.");
      classId = findClass(data, className);
      if (!classId) {
        if (!(className in classMap)) { unknown.add(className); return; }
        classId = classMap[className];
        if (!classId) return; // the teacher chose to skip this class
      }
    }
    let date = todayISO();
    if (has("date")) {
      const raw = get("date");
      if (!raw) return bad("no date.");
      date = parseDate(raw);
      if (!date) return bad(`date “${raw}” isn't a date. Use 2026-11-09 or 11/9/2026.`);
    }
    const correct = parseCorrect(get("correct"));
    if (correct === null) return bad(`correct answer “${get("correct")}” isn't A–D or Survey.`);
    let qn = null;
    if (has("question_number") && get("question_number")) {
      qn = Number(get("question_number"));
      if (!Number.isInteger(qn) || qn < 1) return bad(`question number “${get("question_number")}” isn't a whole number.`);
    }
    const qtext = get("question"), choices = ["choice_a", "choice_b", "choice_c", "choice_d"].map(get);
    if (!qtext && !choices.some(Boolean) && !get("correct")) return bad("has no question or answer.");
    const title = get("set_title") || "Bell work";
    const key = `${classId}|${date}|${normName(title)}`;
    if (!groups.has(key)) groups.set(key, { key, classId, className: data.classes[classId]?.name || className, date, title, items: [] });
    const q = { text: qtext, correct };
    if (choices.some(Boolean)) q.choices = choices;
    groups.get(key).items.push({ qn, rowNo, order: r, q });
  });

  const sets = [];
  for (const g of groups.values()) {
    g.items.sort((a, b) => (a.qn ?? Infinity) - (b.qn ?? Infinity) || a.order - b.order);
    const seen = new Set(), questions = [];
    for (const it of g.items) {
      if (it.qn !== null && seen.has(it.qn)) { problems.push({ row: it.rowNo, msg: `Row ${it.rowNo}: question ${it.qn} is in “${g.title}” twice. Only the first is used.` }); continue; }
      if (it.qn !== null) seen.add(it.qn);
      questions.push(it.q);
    }
    const existing = Object.entries(data.sets[g.classId] || {}).find(([, s]) => s.date === g.date && normName(s.title) === normName(g.title));
    const existingAnswered = existing ? Object.values(existing[1].answers || {}).filter(qa => Object.keys(qa).length).length : 0;
    sets.push({ key: g.key, classId: g.classId, className: g.className, date: g.date, title: g.title, questions, existingId: existing?.[0] || null, existingAnswered });
  }
  sets.sort((a, b) => (data.classes[a.classId]?.order || 99) - (data.classes[b.classId]?.order || 99) || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  problems.sort((a, b) => a.row - b.row);
  return { sets, problems, unknownClasses: [...unknown], questionCount: sets.reduce((n, s) => n + s.questions.length, 0) };
}

// decisions: { setKey: "replace" | "keep" } for sets that already exist. "replace" swaps in the new
// questions and keeps the answers already scanned; "keep" adds a second set beside the old one.
export function applyQuestions(data, plan, decisions = {}) {
  const out = { added: 0, replaced: 0, skipped: 0, questions: 0 };
  for (const s of plan.sets) {
    const sets = (data.sets[s.classId] ||= {});
    const qs = s.questions.map(q => JSON.parse(JSON.stringify(q)));
    if (s.existingId && sets[s.existingId]) {
      const d = decisions[s.key];
      if (d === "replace") { Object.assign(sets[s.existingId], { title: s.title, date: s.date, questions: qs, updated: Date.now() }); out.replaced++; out.questions += qs.length; continue; }
      if (d !== "keep") { out.skipped++; continue; }
    }
    sets[uid()] = { title: s.title, date: s.date, questions: qs, answers: {}, created: Date.now(), updated: Date.now() };
    out.added++; out.questions += qs.length;
  }
  return out;
}

// ---------- roster ----------
// Columns: name (required), class and card (optional). Same matching rules as pasted names.
// choices: { rowNo: "same" | "new" } for names that match a student already in the app.
// Returns { error } or { rows, problems, unknownClasses }, where each row has an action:
//   already (in this class) · enroll (existing student) · link (same new student as an earlier row) · new (with card) · full
export function planRoster(text, data, openClassId, classMap = {}, choices = {}) {
  const rows = parseCSV(text);
  if (!rows.length) return { error: "That file is empty." };
  const h = header(rows[0]), col = n => h.indexOf(n);
  if (col("name") < 0) return { error: "The first row of the file needs column names, with at least “name”." };
  const problems = [], unknown = new Set(), out = [];
  const taken = new Set(Object.values(data.students).map(s => s.card));
  const madeHere = new Map(); // normName → row that creates the new student
  const seenInClass = new Set();
  rows.forEach((row, r) => {
    if (r === 0 || !row.length) return;
    const rowNo = r + 1, get = n => col(n) >= 0 ? String(row[col(n)] ?? "").trim() : "";
    const name = get("name").replace(/\s+/g, " ");
    if (!name) { problems.push({ row: rowNo, msg: `Row ${rowNo}: no name.` }); return; }
    let classId = openClassId;
    if (col("class") >= 0 && get("class")) {
      classId = findClass(data, get("class"));
      if (!classId) {
        if (!(get("class") in classMap)) { unknown.add(get("class")); return; }
        classId = classMap[get("class")];
        if (!classId) return;
      }
    }
    const dupKey = classId + "|" + normName(name);
    if (seenInClass.has(dupKey)) { problems.push({ row: rowNo, msg: `Row ${rowNo}: ${name} is listed twice for ${data.classes[classId].name}.` }); return; }
    seenInClass.add(dupKey);

    let card = null;
    if (get("card")) {
      card = Number(get("card"));
      if (!Number.isInteger(card) || card < 1 || card > MAX_CARDS) { problems.push({ row: rowNo, msg: `Row ${rowNo}: card “${get("card")}” isn't a number from 1 to ${MAX_CARDS}.` }); card = null; }
    }
    const match = studentsByName(data, name);
    const enrolled = new Set(data.classes[classId].studentIds || []);
    const choice = match.length ? (choices[rowNo] || "same") : "new";
    const base = { rowNo, name, classId, className: data.classes[classId].name, match, choice };
    if (match.length && choice === "same") {
      const s = match[0];
      if (card !== null && card !== s.card) problems.push({ row: rowNo, msg: `Row ${rowNo}: ${s.name} keeps card #${s.card} (the file says #${card}).` });
      out.push({ ...base, action: enrolled.has(s.id) ? "already" : "enroll", student: s });
      return;
    }
    const earlier = !match.length && madeHere.get(normName(name));
    if (earlier) { out.push({ ...base, action: "link", linkTo: earlier }); return; }
    const row2 = { ...base, action: "new", want: card, card: null };
    out.push(row2);
    if (!match.length) madeHere.set(normName(name), row2);
  });

  // Card numbers: requested numbers first (in file order), then the lowest free number for the rest.
  const bad = (o, msg) => problems.push({ row: o.rowNo, msg: `Row ${o.rowNo}: ${msg}` });
  for (const o of out) {
    if (o.action !== "new" || o.want === null) continue;
    if (taken.has(o.want)) {
      const holder = studentByCard(data, o.want) || out.find(x => x.action === "new" && x.card === o.want);
      bad(o, `card #${o.want} belongs to ${holder?.name || "someone else"}, so ${o.name} gets the next free number.`);
    } else { o.card = o.want; taken.add(o.want); }
  }
  for (const o of out) {
    if (o.action !== "new" || o.card !== null) continue;
    let k = 1; while (taken.has(k)) k++;
    if (k > MAX_CARDS) { o.action = "full"; bad(o, `all ${MAX_CARDS} cards are in use, so ${o.name} can't be added.`); continue; }
    o.card = k; taken.add(k);
  }
  for (const o of out) if (o.action === "link") { o.card = o.linkTo.card; if (o.linkTo.action === "full") o.action = "full"; }
  return { rows: out, problems: problems.sort((a, b) => a.row - b.row), unknownClasses: [...unknown] };
}

export function applyRoster(data, plan) {
  const ids = new Map(), out = { added: 0, enrolled: 0, already: 0 };
  const enroll = (classId, id) => { const c = data.classes[classId]; if (!c.studentIds.includes(id)) c.studentIds.push(id); };
  for (const r of plan.rows) {
    if (r.action === "already") out.already++;
    else if (r.action === "enroll") { enroll(r.classId, r.student.id); out.enrolled++; }
    else if (r.action === "link") enroll(r.classId, ids.get(r.linkTo.rowNo));
    else if (r.action === "new") {
      const id = uid();
      data.students[id] = { name: r.name, card: r.card };
      enroll(r.classId, id); ids.set(r.rowNo, id); out.added++;
    }
  }
  return out;
}
