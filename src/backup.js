// Backup files. Version 2 is this app's format; version 1 is the prototype's, where each class kept
// its own copy of its students. v1 → v2 migration rules are in BUILD_BRIEF section 6 — keep this
// working forever, since Mr. D's old backups are v1.
import { MAX_CARDS } from "./detect.js";
import { DEFAULT_CLASSES, emptyData } from "./model.js";
import { normName } from "./roster.js";

const clone = o => JSON.parse(JSON.stringify(o));

export function buildBackup(data, now = new Date()) {
  return { app: "stcs-card-scan", version: 2, exported: now.toISOString(), ...clone(data) };
}

// Reads a backup's text. Returns { data, changes, version } or throws with a message for the teacher.
export function readBackup(text) {
  let b;
  try { b = typeof text === "string" ? JSON.parse(text) : text; } catch { throw new Error("That file isn't a Card Scan backup."); }
  if (b?.app !== "stcs-card-scan" || !b.classes) throw new Error("That file isn't a Card Scan backup.");
  if (b.version === 1) return { ...migrateV1(b), version: 1 };
  if (b.version === 2) return { data: normalizeV2(b), changes: [], version: 2 };
  throw new Error("This backup is from a newer version of the app. Update the app, then try again.");
}

function normalizeV2(b) {
  const data = emptyData();
  data.students = clone(b.students || {});
  for (const [id, c] of Object.entries(b.classes || {}))
    data.classes[id] = { ...data.classes[id], ...clone(c), archived: !!c.archived, studentIds: [...(c.studentIds || [])] };
  data.sets = clone(b.sets || {});
  return data;
}

const orderOf = (id, c) => c.order ?? DEFAULT_CLASSES.find(d => d.id === id)?.order ?? 99;

export function migrateV1(b) {
  const data = emptyData();
  const changes = [];
  const classes = Object.entries(b.classes || {}).sort(([ia, a], [ib, b2]) => orderOf(ia, a) - orderOf(ib, b2));

  // 1–2. Merge students by name (case and spacing ignored). The first id seen is kept.
  const byName = new Map();  // normName → merged student
  const idMap = {};          // any old id → kept id
  const merged = [];
  for (const [cid, c] of classes) {
    const studentIds = [];
    for (const s of c.students || []) {
      const key = normName(s.name);
      let m = byName.get(key);
      if (!m) {
        m = { id: s.id, name: String(s.name).trim().replace(/\s+/g, " "), want: s.card, wantFrom: c.name, others: [] };
        byName.set(key, m); merged.push(m);
      } else if (s.card !== m.want) {
        m.others.push({ card: s.card, cls: c.name });
      }
      idMap[s.id] = m.id;
      if (!studentIds.includes(m.id)) studentIds.push(m.id);
    }
    const { students, id, ...rest } = c;
    data.classes[cid] = { ...data.classes[cid], ...rest, order: orderOf(cid, c), archived: !!c.archived, studentIds };
  }

  // 3. Different numbers for the same student: keep the earliest class's number.
  for (const m of merged)
    for (const o of m.others) changes.push(`${m.name}: kept #${m.want} (was #${o.card} in ${o.cls}).`);

  // 4. Two different students with the same number: the first keeps it, the other gets the lowest free number.
  const taken = new Map(); const later = [];
  for (const m of merged) {
    const ok = Number.isInteger(m.want) && m.want >= 1 && m.want <= MAX_CARDS;
    if (ok && !taken.has(m.want)) { taken.set(m.want, m); m.card = m.want; } else later.push(m);
  }
  for (const m of later) {
    let k = 1; while (taken.has(k)) k++;
    if (k > MAX_CARDS) { changes.push(`${m.name}: no card number left (all ${MAX_CARDS} are in use). Give them a number on the Roster tab.`); m.card = null; continue; }
    const holder = taken.get(m.want);
    changes.push(holder ? `${m.name}: now #${k} (was #${m.want}, which ${holder.name} keeps).` : `${m.name}: now #${k} (had no valid card number).`);
    taken.set(k, m); m.card = k;
  }
  for (const m of merged) if (m.card !== null) data.students[m.id] = { name: m.name, card: m.card };
  for (const c of Object.values(data.classes)) c.studentIds = c.studentIds.filter(id => data.students[id]);

  // 2 (cont). Point every answer at the kept id so no history is lost.
  for (const [cid, sets] of Object.entries(b.sets || {})) {
    data.sets[cid] = {};
    for (const [sid, s] of Object.entries(sets)) {
      const { id, ...set } = clone(s);
      const answers = {};
      for (const [q, qa] of Object.entries(set.answers || {})) {
        answers[q] = {};
        for (const [stId, L] of Object.entries(qa)) { const to = idMap[stId] || stId; if (!(to in answers[q]) || stId === to) answers[q][to] = L; }
      }
      data.sets[cid][sid] = { ...set, answers };
    }
  }
  return { data, changes };
}
