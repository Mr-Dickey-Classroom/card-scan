// The shared student list: one card number per student, the same in every class, never shared.
import { MAX_CARDS } from "./detect.js";
import { uid } from "./model.js";

export const normName = s => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function lowestFreeCard(students, taken = new Set()) {
  const used = new Set([...taken, ...Object.values(students).map(s => s.card)]);
  for (let k = 1; k <= MAX_CARDS; k++) if (!used.has(k)) return k;
  return null;
}

export function studentsByName(data, name) {
  const n = normName(name);
  return Object.entries(data.students).filter(([, s]) => normName(s.name) === n).map(([id, s]) => ({ id, ...s }));
}

export function studentByCard(data, card) {
  const e = Object.entries(data.students).find(([, s]) => s.card === card);
  return e ? { id: e[0], ...e[1] } : null;
}

// Students enrolled in a class, sorted by card number.
export function classStudents(data, classId) {
  const ids = data.classes[classId]?.studentIds || [];
  return ids.filter(id => data.students[id]).map(id => ({ id, ...data.students[id] })).sort((a, b) => a.card - b.card);
}

// "Ava Martinez" → "Ava M."
export const shortName = name => { const [f, ...r] = String(name).trim().split(/\s+/); return r.length ? `${f} ${r[r.length - 1][0]}.` : f; };

// One name per line; strips "1." / "1)" numbering and tabs.
export const parseNames = txt => String(txt).split(/\r?\n/).map(s => s.replace(/^\s*\d+[.)]\s*/, "").replace(/\t/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);

// Step 1 of adding pasted names: say what will happen to each one, without changing anything.
// match = existing students with that name (the teacher picks "same" or "new" when there is one).
export function planAdd(data, classId, names) {
  const enrolled = new Set(data.classes[classId]?.studentIds || []);
  const seen = new Set();
  return names.filter(n => { const k = normName(n); if (seen.has(k)) return false; seen.add(k); return true; }).map(name => {
    const match = studentsByName(data, name);
    const inClass = match.find(m => enrolled.has(m.id));
    return { name, match, inClass: inClass || null, choice: match.length ? "same" : "new" };
  });
}

// Step 2: apply the plan. Returns what happened, for the message to the teacher.
export function applyAdd(data, classId, plan) {
  const cls = data.classes[classId];
  const out = { added: [], enrolled: [], already: [], full: [] };
  for (const row of plan) {
    if (row.inClass && row.choice === "same") { out.already.push(row.inClass); continue; }
    if (row.choice === "same" && row.match.length) {
      const s = row.match[0];
      if (!cls.studentIds.includes(s.id)) cls.studentIds.push(s.id);
      out.enrolled.push(s); continue;
    }
    const card = lowestFreeCard(data.students);
    if (card === null) { out.full.push(row.name); continue; }
    const id = uid();
    data.students[id] = { name: row.name.trim().replace(/\s+/g, " "), card };
    cls.studentIds.push(id);
    out.added.push({ id, ...data.students[id] });
  }
  return out;
}

export function enroll(data, classId, ids) {
  const cls = data.classes[classId];
  for (const id of ids) if (data.students[id] && !cls.studentIds.includes(id)) cls.studentIds.push(id);
}

// Takes the student off this roster only. Their past answers stay.
export function unenroll(data, classId, id) {
  const cls = data.classes[classId];
  cls.studentIds = cls.studentIds.filter(x => x !== id);
}

// Removes the student from the app entirely (answers in old sets stay but no longer show).
export function deleteStudent(data, id) {
  for (const c of Object.values(data.classes)) c.studentIds = c.studentIds.filter(x => x !== id);
  delete data.students[id];
}

export function renameStudent(data, id, name) {
  const n = String(name).trim().replace(/\s+/g, " ");
  if (!n) return { ok: false, reason: "Enter a name." };
  data.students[id].name = n;
  return { ok: true };
}

// Changes the number everywhere. Refuses a number someone else has, and says who.
export function setCard(data, id, card) {
  card = Number(card);
  if (!Number.isInteger(card) || card < 1 || card > MAX_CARDS) return { ok: false, reason: `Card numbers go from 1 to ${MAX_CARDS}.` };
  const holder = studentByCard(data, card);
  if (holder && holder.id !== id) return { ok: false, holder, reason: `Card #${card} belongs to ${holder.name}.` };
  data.students[id].card = card;
  return { ok: true };
}

// Who a scanned card belongs to, from this class's point of view.
export function matchCard(data, classId, card) {
  const s = studentByCard(data, card);
  if (!s) return { student: null, enrolled: false };
  return { student: s, enrolled: (data.classes[classId]?.studentIds || []).includes(s.id) };
}

// Students in the app who aren't in this class yet (for "Add existing students").
export function notInClass(data, classId) {
  const ids = new Set(data.classes[classId]?.studentIds || []);
  return Object.entries(data.students).filter(([id]) => !ids.has(id)).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.name.localeCompare(b.name));
}
