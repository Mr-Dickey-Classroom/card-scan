// STCS Card Scan — screens and event handling. Logic lives in the other modules; this file draws
// the page and turns taps into changes. Ported from reference/prototype-artifact.html.
import "./styles.css";
import cardsPdfUrl from "../reference/STCS_Answer_Cards_1-40.pdf?url";
import templateCsvUrl from "../reference/csv/questions_TEMPLATE.csv?url";
import { MAX_CARDS, detectMulti, fileToCanvas, angleToLetter } from "./detect.js";
import { LETTERS, uid, todayISO, addClass, backupDue } from "./model.js";
import { load, save } from "./storage.js";
import { classStudents, planAdd, applyAdd, parseNames, setCard, renameStudent, unenroll, enroll, notInClass, matchCard, shortName, perClass, cardHolders, setCardMode } from "./roster.js";
import { setPct, qProgress, sortSets, reportSets, reportRows, reteachList } from "./scoring.js";
import { parsePaste } from "./paste.js";
import { scoresCSV, answersCSV, questionsCSV } from "./csv.js";
import { planQuestions, applyQuestions, planRoster, applyRoster } from "./upload.js";
import { buildBackup, readBackup } from "./backup.js";
import { openLive } from "./live.js";

// ---------- state ----------
const S = {
  data: null, mode: "starting",
  cls: lsGet("cls") || "math8", tab: lsGet("tab") || "sets",
  openSet: null, q: 0, pick: null, editing: false, lastScan: null, newSet: null,
  report: { range: "week", chosen: [] }, rosterEdit: null, confirm: null,
  addPlan: null, existing: null, restore: null, restored: null, update: null, newClass: null, setup: false, cardModeErr: null,
  qImport: null, rImport: null, // CSV uploads waiting in a preview: { name, text, classMap, dec }
  proj: false, projReveal: false, // projector view: open, and whether the answer is showing
};
function lsGet(k) { try { return localStorage.getItem("cardscan:" + k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem("cardscan:" + k, v); } catch { /* not important */ } }

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const fmtDay = iso => { const d = new Date(iso + "T12:00:00"); return { dow: d.toLocaleDateString(undefined, { weekday: "short" }), day: d.getDate(), long: d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) }; };
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }
function busy(on, text) { $("#busy").hidden = !on; if (text) $("#busyText").textContent = text; }
const classList = () => Object.entries(S.data.classes).map(([id, c]) => ({ id, ...c })).filter(c => !c.archived).sort((a, b) => (a.order || 99) - (b.order || 99));
const curClass = () => S.data.classes[S.cls] || null;
const students = () => classStudents(S.data, S.cls);
const classSets = () => (S.data.sets[S.cls] ||= {});
const curSet = () => S.openSet ? classSets()[S.openSet] : null;

function commit() {
  render();
  if (S.mode !== "device") return;
  save(S.data).catch(() => { S.mode = "memory"; setSync(); render(); toast("This browser won't save. Download a backup before closing the page."); });
}
function saveSet(set) { set.updated = Date.now(); commit(); }
function setSync() { $("#sync").textContent = S.mode === "device" ? "Saved on this phone" : S.mode === "memory" ? "Not saving" : "Loading…"; }

function download(filename, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast("Saved " + filename);
}

// ---------- photo scanning ----------
async function handlePhoto(file) {
  const set = curSet(); if (!file || !set) return;
  busy(true, "Reading cards…");
  await new Promise(r => setTimeout(r, 40)); // let the "Reading cards…" overlay paint first
  try {
    const canvas = await fileToCanvas(file);
    const items = detectMulti(canvas);
    S.lastScan = { q: S.q, turn: 0, items, canvas };
    applyScan(set, S.lastScan);
  } catch (e) { console.error(e); toast(e.message || "Couldn't read that photo."); }
  finally { busy(false); }
}

// Writes a scan's answers into the set. Only students enrolled in this class are matched.
// prevTurn: when the teacher turns a sideways photo, first remove the answers the old turn wrote.
function applyScan(set, scan, prevTurn = null) {
  const qa = { ...(set.answers?.[scan.q] || {}) };
  const tilted = [], notHere = [], unassigned = [];
  let read = 0;
  for (const it of scan.items) {
    const { student, enrolled } = matchCard(S.data, S.cls, it.card);
    if (prevTurn !== null && enrolled && qa[student.id] === angleToLetter(it.angle, prevTurn)) delete qa[student.id];
    const L = angleToLetter(it.angle, scan.turn);
    if (!student) { unassigned.push(it.card); continue; }
    if (!enrolled) { notHere.push(student); continue; }
    if (!L) { tilted.push(student.name); continue; }
    qa[student.id] = L; read++;
  }
  scan.summary = { read, tilted, notHere, unassigned, total: scan.items.length };
  set.answers = { ...(set.answers || {}), [scan.q]: qa };
  saveSet(set);
}

// ---------- live scanning ----------
function liveSettings() { try { return { hideColors: false, debug: false, ...JSON.parse(lsGet("live") || "{}") }; } catch { return { hideColors: false, debug: false }; } }

function startLive() {
  const set = curSet(); if (!set) return;
  const q = S.q, question = set.questions[q];
  S.pick = null;
  openLive({
    title: `Q${q + 1}${set.questions.length > 1 ? ` of ${set.questions.length}` : ""}`,
    correct: question?.correct || "",
    question: question?.text || "",
    projector: S.proj, // started from the projector view: hide names and answers
    inert: S.proj ? ["#proj"] : [],
    students: students(),
    existing: set.answers?.[q] || {},
    lookup: card => matchCard(S.data, S.cls, card),
    settings: liveSettings(),
    saveSettings: st => lsSet("live", JSON.stringify(st)),
    onDone: ({ reads, tilted }) => {
      const s2 = curSet(); if (s2 !== set) return;
      S.lastScan = { q, live: true, reads, tilted };
      applyLive(set, S.lastScan);
      if (!S.proj) window.scrollTo(0, 0);
      (S.proj ? $("#proj [data-act='live']") : $("#view [data-act='live']"))?.focus({ preventScroll: true });
    },
    onCancel: () => (S.proj ? $("#proj [data-act='live']") : $("#view [data-act='live']"))?.focus({ preventScroll: true }),
    onPhoto: () => { $("#camIn").value = ""; $("#camIn").click(); },
  });
}

// Writes a live scan's reads into the set. Like applyScan, only enrolled students are matched.
function applyLive(set, scan) {
  const qa = { ...(set.answers?.[scan.q] || {}) };
  const notHere = [], unassigned = [];
  let read = 0;
  for (const { card, letter } of scan.reads) {
    const { student, enrolled } = matchCard(S.data, S.cls, card);
    if (!student) { unassigned.push(card); continue; }
    if (!enrolled) { notHere.push(student); continue; }
    qa[student.id] = letter; read++;
  }
  const tilted = scan.tilted.map(card => matchCard(S.data, S.cls, card)).filter(m => m.enrolled && !qa[m.student.id]).map(m => m.student.name);
  scan.summary = { read, tilted, notHere, unassigned, total: scan.reads.length + tilted.length };
  set.answers = { ...(set.answers || {}), [scan.q]: qa };
  saveSet(set);
}

// ---------- rendering ----------
function render() {
  $("#chips").innerHTML = classList().map(c => `<button class="chip" data-cls="${c.id}" aria-pressed="${c.id === S.cls && S.newClass === null}"><i style="background:var(${c.color || "--c8"})"></i>${esc(c.name)}</button>`).join("")
    + `<button class="chip add" data-act="addclass" aria-pressed="${S.newClass !== null}">+ Add class</button>`;
  for (const b of document.querySelectorAll("#tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === S.tab && S.newClass === null));
  const v = $("#view"), keepScroll = window.scrollY;
  if (S.newClass !== null) v.innerHTML = viewNewClass();
  else if (S.tab === "sets") v.innerHTML = curSet() ? viewSet() : (S.newSet ? viewNewSet() : viewSets());
  else if (S.tab === "roster") v.innerHTML = viewRoster();
  else if (S.tab === "reports") v.innerHTML = viewReports();
  else v.innerHTML = viewCards();
  if (S.tab === "sets" && curSet() && S.lastScan && S.lastScan.q === S.q) drawPreview();
  window.scrollTo(0, keepScroll);
  renderProjector();
}

// ---------- projector view ----------
// Big text for the class to see (mirror the phone to the projector): the question, its choices and
// how many have answered. It never shows who answered what. "Show answer" adds the class totals.
function renderProjector() {
  const p = $("#proj"), open = S.proj && S.tab === "sets" && !!curSet();
  if (!open && S.proj) S.proj = false;
  const was = !p.hidden;
  p.hidden = !open;
  document.body.classList.toggle("projecting", open);
  for (const sel of ["header.top", "main"]) $(sel).inert = open;
  if (!open) return;
  // keep keyboard focus on the same button across redraws (or the next one, if it just got disabled)
  const focused = p.contains(document.activeElement) ? document.activeElement.dataset.act : null;
  p.innerHTML = viewProjector();
  const f = focused && (p.querySelector(`[data-act="${focused}"]:not(:disabled)`) || p.querySelector('[data-act="projreveal"]'));
  (f || (!was && p.querySelector('[data-act="projclose"]')))?.focus({ preventScroll: true });
}

function viewProjector() {
  const set = curSet(), qs = set.questions || [], q = qs[S.q] || {}, sts = students(), qa = set.answers?.[S.q] || {};
  const letters = sts.map(s => qa[s.id]).filter(Boolean), n = letters.length;
  const graded = LETTERS.includes(q.correct), reveal = S.projReveal;
  const counts = LETTERS.map(L => letters.filter(x => x === L).length);
  const hasChoices = q.choices?.some(Boolean);
  const choices = hasChoices || reveal ? `<ol class="pchoices">${LETTERS.map((L, j) => {
    const right = reveal && graded && q.correct === L;
    return `<li class="${right ? "right" : ""}"><b>${L}</b><span class="pt">${esc(q.choices?.[j] || "")}${right ? ` <span class="sr">(correct)</span>` : ""}</span>
      ${reveal ? `<span class="pbar" aria-hidden="true"><span style="width:${n ? Math.round(100 * counts[j] / n) : 0}%"></span></span><span class="pn">${counts[j]}</span>` : ""}</li>`;
  }).join("")}</ol>` : "";
  const pct = graded && n ? Math.round(100 * counts[LETTERS.indexOf(q.correct)] / n) : null;
  return `<div class="ptop"><span>${esc(curClass()?.name || "")} · ${esc(set.title || "Bell work")}</span>
      <button class="lbtn" data-act="projclose" aria-label="Close projector view">✕</button></div>
    <div class="pmain">
      <div class="pq">Question ${S.q + 1}${qs.length > 1 ? ` of ${qs.length}` : ""}</div>
      ${q.text ? `<p class="ptext">${esc(q.text)}</p>` : ""}
      ${choices}
      <div class="pcount" aria-live="polite"><b>${n}</b> / ${sts.length} answered</div>
      ${reveal ? `<div class="presult">${graded ? `Correct answer: <b>${q.correct}</b>${pct === null ? "" : ` · ${pct}% got it`}` : q.correct === "ANY" ? "Survey question: every answer counts." : "No correct answer set for this question."}</div>` : ""}
    </div>
    <div class="pbottom">
      <button class="lbtn" data-act="projprev" ${S.q > 0 ? "" : "disabled"} aria-label="Previous question">←</button>
      <button class="lbtn wide" data-act="projreveal" aria-pressed="${reveal}">${reveal ? "Hide answer" : "Show answer"}</button>
      <button class="lbtn wide primary" data-act="live" ${sts.length ? "" : "disabled"}>Live scan</button>
      <button class="lbtn" data-act="projnext" ${S.q < qs.length - 1 ? "" : "disabled"} aria-label="Next question">→</button>
    </div>`;
}

function banner() {
  if (S.setup) return `<div class="panel"><h3>Welcome to Card Scan</h3>
    <p class="sub" style="margin:0">Set up your classes. You can rename, add or hide classes later. Moving from another phone? Restore your backup on the <b>Cards</b> tab instead.</p>
    <label class="f">Your classes, one per line<textarea id="setupClasses" placeholder="1st period Math&#10;2nd period Math&#10;Science"></textarea></label>
    <fieldset class="f"><legend>Card numbers</legend>
      <label class="check"><input type="radio" name="setupCards" value="app" checked> One card per student, the same in every class (up to ${MAX_CARDS} students in all)</label>
      <label class="check"><input type="radio" name="setupCards" value="class"> Each class uses cards 1–${MAX_CARDS} (more than ${MAX_CARDS} students in all)</label></fieldset>
    <div class="row"><button class="btn primary" data-act="setup2">Save my classes</button><button class="btn" data-act="setupskip">Use the example classes</button></div></div>`;
  if (S.update) return `<div class="note info row" style="align-items:center;justify-content:space-between"><span><b>A new version of Card Scan is ready.</b></span><button class="btn sm primary" data-act="update">Update now</button></div>`;
  if (S.mode === "memory") return `<div class="note"><b>Not saving.</b> This browser is blocking storage (a private window, maybe). Download a backup on the Cards tab before you close the page.</div>`;
  if (backupDue(S.data)) return `<div class="note info backupdue"><span><b>Time for this week's backup.</b> Your classes are saved on this phone only. A backup file keeps them safe if the phone is lost or replaced.</span>
    <div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="backup">Download backup</button><button class="btn sm ghost" data-act="backupsnooze">Not now</button></div></div>`;
  return "";
}

const goTab = (t, label) => `<button class="btn" data-act="gotab" data-t="${t}">${label}</button>`;

function viewNewClass() {
  const hidden = Object.entries(S.data.classes).filter(([, c]) => c.archived);
  return `<div><h2>Add a class</h2><p class="sub">Add as many classes as you like. Students keep the same card number in every class.</p></div>
  <div class="panel"><label class="f">Class name<input type="text" id="newClassName" value="${esc(S.newClass)}" placeholder="e.g. 6th Math" autocomplete="off"></label>
    <div class="row"><button class="btn primary" data-act="addclass2">Add class</button><button class="btn" data-act="addclasscancel">Cancel</button></div></div>
  ${hidden.length ? `<div class="panel"><h3>Hidden classes</h3>${hidden.map(([id, c]) => `<div class="row" style="justify-content:space-between"><span>${esc(c.name)}</span><button class="btn sm" data-act="unhide" data-cid="${id}">Bring back</button></div>`).join("")}</div>` : ""}`;
}

function viewSets() {
  const c = curClass(), list = sortSets(classSets()), sts = students(), n = sts.length;
  const items = list.map(s => {
    const d = fmtDay(s.date || todayISO()), p = setPct(s, sts);
    const done = (s.questions || []).filter((_, i) => qProgress(s, i, sts) > 0).length;
    return `<button class="setitem" data-open="${s.id}">
      <div class="datebox"><div class="d">${esc(d.dow)}</div><div class="n">${d.day}</div></div>
      <div><div class="t">${esc(s.title || "Bell work")}</div><div class="m">${plural((s.questions || []).length, "question")} · ${done} scanned</div></div>
      <div class="pct">${p === null ? "—" : p + "%"}<small>class avg</small></div></button>`;
  }).join("");
  return `${banner()}
  <div class="row spread"><div><h2>${esc(c?.name || "")} bell work</h2><p class="sub">${plural(n, "student")} on the roster</p></div>
  <button class="btn primary" data-act="newset">+ New set</button></div>
  ${S.qImport ? viewQImport() : `<div class="row"><button class="btn" data-act="qupload">Upload questions (CSV)</button>
    ${list.length ? `<button class="btn sm" data-act="qdownclass">Download as CSV</button>` : ""}
    <a class="btn sm ghost" href="${templateCsvUrl}" download="questions_TEMPLATE.csv">Blank template</a></div>`}
  ${n === 0 ? `<div class="note info row spread"><span>Add your students on the <b>Roster</b> tab first, so scanned cards match names.</span>${goTab("roster", "Go to Roster")}</div>` : ""}
  ${list.length ? `<div class="setlist">${items}</div>` : `<div class="panel empty"><b>No bell work yet</b>
    <span>Two ways to start:</span>
    <ol class="steps" style="text-align:left">
      <li><b>+ New set</b> for today: pick how many questions and the correct letters (or paste them, like <b>B A C A</b>).</li>
      <li><b>Upload questions (CSV)</b> (above) from Excel or Google Sheets. One file can hold a whole week for every class. Start from the <b>Blank template</b>.</li>
    </ol>
    <span>Then open the set and tap <b>Live scan</b> for each question.</span>
    <button class="btn primary" data-act="newset">+ New set</button></div>`}`;
}

const classOptions = (sel = "") => classList().map(c => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
// "Math 8" isn't a class: ask which one to use (or skip), never guess.
const askClasses = (names, map, attr) => names.map(n => `<label class="f"><span>“${esc(n)}” isn't one of your classes. Which class is it?</span>
  <select data-${attr}="${esc(n)}"><option value="">Choose…</option>${classOptions(map[n])}<option value="__new">Make a new class called “${esc(n)}”</option><option value="__skip">Skip these rows</option></select></label>`).join("");
const problemList = probs => probs.length ? `<div class="note"><b>${plural(probs.length, "problem")}</b>. These rows won't be imported:<ul class="changes">${probs.map(x => `<li>${esc(x.msg)}</li>`).join("")}</ul>Fix the file and upload it again, or import the rows that are fine.</div>` : "";

function qImportPlan() { const I = S.qImport; return planQuestions(I.text, S.data, S.cls, I.classMap); }
function viewQImport() {
  const I = S.qImport, p = qImportPlan();
  const head = `<div class="row spread"><h3>Upload questions</h3><span class="sub">${esc(I.name)}</span></div>`;
  if (p.error) return `<div class="panel">${head}<div class="note">${esc(p.error)}</div><div class="row"><button class="btn primary" data-act="qupload">Choose another file</button><button class="btn" data-act="qcancel">Cancel</button></div></div>`;
  const undecided = p.sets.filter(x => x.existingId && !I.dec[x.key]).length;
  const rows = p.sets.map(x => {
    const d = fmtDay(x.date);
    return `<div class="match"><span><b>${esc(x.className)}</b> · ${esc(d.long)} · ${esc(x.title)} · ${plural(x.questions.length, "question")}</span>
      ${x.existingId ? `<span class="sub">You already have this set${x.existingAnswered ? `, with answers scanned for ${plural(x.existingAnswered, "question")}` : ""}. <b>Replace</b> updates its questions${x.existingAnswered ? " and keeps the scanned answers" : ""}. <b>Keep both</b> adds a second copy.</span>
      <div class="seg"><button class="btn sm" data-act="qdec" data-k="${esc(x.key)}" data-c="replace" aria-pressed="${I.dec[x.key] === "replace"}">Replace</button><button class="btn sm" data-act="qdec" data-k="${esc(x.key)}" data-c="keep" aria-pressed="${I.dec[x.key] === "keep"}">Keep both</button></div>` : ""}</div>`;
  }).join("");
  const why = p.unknownClasses.length ? "Choose a class above first." : undecided ? "Choose Replace or Keep both for each set you already have." : "";
  return `<div class="panel">${head}
    ${askClasses(p.unknownClasses, Object.fromEntries(Object.entries(I.classMap).map(([k, v]) => [k, v || "__skip"])), "qmap")}
    <p style="margin:0;font-size:18px"><b>${plural(p.sets.length, "set")}, ${plural(p.questionCount, "question")}</b></p>
    ${rows ? `<div>${rows}</div>` : ""}
    ${problemList(p.problems)}
    ${why ? `<p class="sub">${why}</p>` : ""}
    <div class="row"><button class="btn primary" data-act="qimport" ${p.sets.length && !why ? "" : "disabled"}>Import ${plural(p.sets.length, "set")}</button>
      <button class="btn" data-act="qupload">Upload a fixed file</button><button class="btn" data-act="qcancel">Cancel</button></div></div>`;
}

function rImportPlan() { const I = S.rImport; return planRoster(I.text, S.data, S.cls, I.classMap, I.dec); }
function viewRImport() {
  const I = S.rImport, p = rImportPlan();
  const head = `<div class="row spread"><b>Roster file</b><span class="sub">${esc(I.name)}</span></div>`;
  if (p.error) return `${head}<div class="note">${esc(p.error)}</div><div class="row"><button class="btn primary" data-act="rupload">Choose another file</button><button class="btn" data-act="rcancel">Cancel</button></div>`;
  const rows = p.rows.map(r => {
    const where = `<span class="sub">→ ${esc(r.className)}</span>`;
    const same = r.match.length ? `<div class="seg"><button class="btn sm" data-act="rdec" data-row="${r.rowNo}" data-c="same" aria-pressed="${r.choice === "same"}">Same student</button><button class="btn sm" data-act="rdec" data-row="${r.rowNo}" data-c="new" aria-pressed="${r.choice === "new"}">Different student</button></div>` : "";
    const what = r.action === "already" ? `is already in this class (card #${r.student.card}).`
      : r.action === "enroll" ? `— already card #${r.student.card}. Same student?`
      : r.action === "link" ? `— same student as row ${r.linkTo.rowNo}, card #${r.card}.`
      : r.action === "full" ? `can't be added: all ${MAX_CARDS} cards are in use.`
      : r.match.length ? `— a different student with the same name, gets card #${r.card}.` : `— new student, card #${r.card}.`;
    return `<div class="match"><span><b>${esc(r.name)}</b> ${what} ${where}</span>${same}</div>`;
  }).join("");
  const n = p.rows.filter(r => r.action !== "already" && r.action !== "full").length;
  return `${head}${askClasses(p.unknownClasses, Object.fromEntries(Object.entries(I.classMap).map(([k, v]) => [k, v || "__skip"])), "rmap")}
    <div>${rows}</div>${problemList(p.problems)}
    ${p.unknownClasses.length ? `<p class="sub">Choose a class above first.</p>` : ""}
    <div class="row"><button class="btn primary" data-act="rimport" ${n && !p.unknownClasses.length ? "" : "disabled"}>Add ${plural(n, "student")}</button><button class="btn" data-act="rupload">Upload a fixed file</button><button class="btn" data-act="rcancel">Cancel</button></div>`;
}

const csvName = (...parts) => parts.join("_").replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "") + ".csv";
const choiceInputs = (choices, attrs) => `<div class="grid2">${LETTERS.map((L, j) => `<label class="f">Choice ${L}<input type="text" ${attrs(j)} value="${esc(choices?.[j] || "")}"></label>`).join("")}</div>`;

function viewNewSet() {
  const ns = S.newSet;
  const qs = ns.questions.map((q, i) => `
    <div class="panel" style="gap:8px">
      <div class="row spread"><h3>Question ${i + 1}</h3>${ns.questions.length > 1 ? `<button class="btn sm ghost danger" data-act="nsdel" data-i="${i}">Remove</button>` : ""}</div>
      <label class="f">Question text (optional)<input type="text" data-ns="text" data-i="${i}" value="${esc(q.text)}" placeholder="e.g. Where is the image of (6, −4)?"></label>
      <details ${q.choices?.some(Boolean) ? "open" : ""}><summary class="sub" style="cursor:pointer">Answer choices (optional)</summary>${choiceInputs(q.choices, j => `data-ns="choice" data-i="${i}" data-j="${j}"`)}</details>
      <div class="row"><span class="sub">Correct answer</span><div class="letters">${LETTERS.map(L => `<button class="letter" data-act="nscorrect" data-i="${i}" data-l="${L}" aria-pressed="${q.correct === L}" aria-label="Question ${i + 1} correct answer ${L}">${L}</button>`).join("")}<button class="letter any" data-act="nscorrect" data-i="${i}" data-l="ANY" aria-pressed="${q.correct === "ANY"}" aria-label="Question ${i + 1} is a survey">Survey</button></div></div>
    </div>`).join("");
  return `<div class="row spread"><h2>New bell work set</h2><button class="btn ghost" data-act="nscancel">Cancel</button></div>
  <div class="panel">
    <div class="grid2"><label class="f">Title<input type="text" data-ns="title" value="${esc(ns.title)}"></label>
    <label class="f">Date<input type="date" data-ns="date" value="${esc(ns.date)}"></label></div>
    <details><summary class="sub" style="cursor:pointer">Paste questions instead</summary>
      <div style="display:grid;gap:8px;margin-top:8px">
        <p class="sub">Paste numbered questions with a <b>CORRECT: B</b> line under each, like the Plickers text file. Or paste just the letters, like <b>B A C A</b>.</p>
        <textarea id="nsPaste" aria-label="Pasted questions" placeholder="1. Which point is the center of dilation?&#10;   A. point A&#10;   CORRECT: C"></textarea>
        <button class="btn" data-act="nsparse">Fill in from pasted text</button>
      </div></details>
  </div>
  ${qs}
  <div class="row"><button class="btn" data-act="nsadd">+ Add question</button></div>
  <button class="scanbtn" data-act="nssave">Save set</button>
  <p class="sub">“Survey” questions record answers without a right or wrong. Use them for preview questions you don't want to grade.</p>`;
}

const CAM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>`;
function viewSet() {
  const set = curSet(), qs = set.questions || [], sts = students();
  if (S.q >= qs.length) S.q = 0;
  const q = qs[S.q], qa = set.answers?.[S.q] || {};
  const answered = sts.filter(s => qa[s.id]).length;
  const correctN = q?.correct && q.correct !== "ANY" ? sts.filter(s => qa[s.id] === q.correct).length : null;
  const d = fmtDay(set.date || todayISO());
  const pills = qs.map((x, i) => `<button class="qpill" data-act="q" data-i="${i}" aria-pressed="${i === S.q}" aria-label="Question ${i + 1}, ${Math.round(qProgress(set, i, sts) * 100)}% scanned">Q${i + 1}<span class="bar"><span style="width:${Math.round(qProgress(set, i, sts) * 100)}%"></span></span></button>`).join("");
  const sm = S.lastScan && S.lastScan.q === S.q ? S.lastScan.summary : null;
  const scanNote = sm ? `<div class="note">
      <b>Read ${plural(sm.read, "card")}</b> ${S.lastScan.live ? "in the live scan" : "from this photo"}.
      ${sm.tilted.length ? `<br>Tilted too far to read: ${sm.tilted.map(esc).join(", ")}. Have them hold the card straight, then scan again.` : ""}
      ${sm.notHere.map(st => `<div class="row" style="margin-top:6px"><span>Card ${st.card} (${esc(shortName(st.name))}) isn't in this class.</span><button class="btn sm" data-act="enrollscan" data-sid="${st.id}">Add to ${esc(curClass()?.name)}</button></div>`).join("")}
      ${sm.unassigned.length ? `<br>${sm.unassigned.length > 1 ? "Cards" : "Card"} ${sm.unassigned.join(", ")} ${sm.unassigned.length > 1 ? "aren't" : "isn't"} given to any student yet.` : ""}
      ${sm.total === 0 ? `<br>No cards found. Get closer or turn on more light, and keep the whole card in view.` : ""}
      ${S.lastScan.live ? "" : `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="turn">Photo was sideways? Turn answers ↻</button></div>`}
    </div>` : "";
  const rows = sts.map(s => {
    const a = qa[s.id];
    const cls = !a ? "" : q?.correct === "ANY" ? "any" : q?.correct ? (a === q.correct ? "ok" : "bad") : "";
    return `<div class="srow"><span class="card">#${s.card}</span><span class="name">${esc(s.name)}</span>
      <button class="ans ${cls}" data-act="pick" data-sid="${s.id}" aria-label="${esc(s.name)}: ${a || "no answer"}. Tap to change.">${a || "—"}</button>
      ${S.pick === s.id ? `<div class="picker">${LETTERS.map(L => `<button class="letter" data-act="setans" data-sid="${s.id}" data-l="${L}" aria-pressed="${a === L}" aria-label="${esc(s.name)}: ${L}">${L}</button>`).join("")}<button class="btn sm" data-act="setans" data-sid="${s.id}" data-l="" aria-label="Clear ${esc(s.name)}'s answer">Clear</button></div>` : ""}</div>`;
  }).join("");
  return `<div class="row spread"><button class="btn ghost sm" data-act="back">← All sets</button>
    <button class="btn sm" data-act="editset">${S.editing ? "Done" : "Edit"}</button></div>
  <div><h2>${esc(set.title || "Bell work")}</h2><p class="sub">${esc(d.long)}</p></div>
  ${S.editing ? viewEditSet(set) : ""}
  <div class="qpills" role="group" aria-label="Question">${pills}</div>
  <div class="panel">
    <div class="row spread"><h3>Question ${S.q + 1}</h3>
      <div class="letters">${LETTERS.map(L => `<button class="letter" data-act="correct" data-l="${L}" aria-pressed="${q?.correct === L}" aria-label="Correct answer ${L}">${L}</button>`).join("")}<button class="letter any" data-act="correct" data-l="ANY" aria-pressed="${q?.correct === "ANY"}">Survey</button></div></div>
    ${q?.text ? `<p style="margin:0;font-size:18px">${esc(q.text)}</p>` : ""}
    ${q?.choices?.some(Boolean) ? `<ol class="choices">${LETTERS.map((L, j) => q.choices[j] ? `<li class="${q.correct === L ? "right" : ""}"><b>${L}</b> ${esc(q.choices[j])}</li>` : "").join("")}</ol>` : ""}
    ${!q?.correct ? `<div class="note">Tap the correct letter above so answers can be marked right or wrong.</div>` : ""}
    <div class="stats"><div class="stat"><div class="v">${answered}/${sts.length}</div><div class="l">Answered</div></div>
      <div class="stat"><div class="v">${correctN === null ? "—" : correctN}</div><div class="l">Correct</div></div>
      <div class="stat"><div class="v">${correctN === null || !answered ? "—" : Math.round(100 * correctN / answered) + "%"}</div><div class="l">Of answered</div></div></div>
    <button class="scanbtn" data-act="live" ${sts.length ? "" : "disabled"}>${CAM} Live scan</button>
    <div class="row"><button class="btn sm" data-act="scan" ${sts.length ? "" : "disabled"}>Take photo of room</button>
      <button class="btn sm" data-act="pickphoto" ${sts.length ? "" : "disabled"}>Use a photo you already took</button>
      <button class="btn sm" data-act="projopen">Projector view</button>
      ${S.q < qs.length - 1 ? `<button class="btn sm dark" data-act="q" data-i="${S.q + 1}">Next: Q${S.q + 2} →</button>` : ""}</div>
    ${scanNote}
    ${sm && !S.lastScan.live ? `<div class="photo"><canvas id="preview"></canvas></div>` : ""}
  </div>
  ${sts.length ? `<div class="roster" aria-label="Answers">${rows}</div><p class="sub">Tap an answer to change it by hand. A new scan overwrites only the cards it reads.</p>` : `<div class="note info row spread"><span>No students in ${esc(curClass()?.name)} yet. Add them on the Roster tab, then scan.</span>${goTab("roster", "Go to Roster")}</div>`}`;
}

function viewEditSet(set) {
  return `<div class="panel">
    <div class="grid2"><label class="f">Title<input type="text" data-es="title" value="${esc(set.title)}"></label>
    <label class="f">Date<input type="date" data-es="date" value="${esc(set.date)}"></label></div>
    <label class="f">Question ${S.q + 1} text<input type="text" data-es="qtext" value="${esc(set.questions[S.q]?.text || "")}"></label>
    ${choiceInputs(set.questions[S.q]?.choices, j => `data-es="choice" data-j="${j}"`)}
    <div class="row"><button class="btn sm" data-act="esadd">+ Add question</button>
      ${set.questions.length > 1 ? `<button class="btn sm danger" data-act="esdelq">Remove Q${S.q + 1}</button>` : ""}
      <button class="btn sm" data-act="esclearq">Clear Q${S.q + 1} answers</button>
      <button class="btn sm" data-act="qdownset">Download as CSV</button></div>
    ${S.confirm === "delset" ? `<div class="note">Delete this set and all its answers? This can't be undone. <div class="row" style="margin-top:8px"><button class="btn sm danger" data-act="delset2">Delete set</button><button class="btn sm" data-act="cancelconfirm">Keep it</button></div></div>`
      : `<div><button class="btn sm danger" data-act="delset">Delete set…</button></div>`}
  </div>`;
}

function drawPreview() {
  const cv = $("#preview"), sc = S.lastScan; if (!cv || !sc?.canvas) return;
  const k = Math.min(1, 900 / sc.canvas.width); cv.width = Math.round(sc.canvas.width * k); cv.height = Math.round(sc.canvas.height * k);
  const x = cv.getContext("2d"); x.drawImage(sc.canvas, 0, 0, cv.width, cv.height);
  const correct = curSet()?.questions?.[sc.q]?.correct;
  for (const it of sc.items) {
    const L = angleToLetter(it.angle, sc.turn), { student: st, enrolled } = matchCard(S.data, S.cls, it.card);
    const col = !enrolled || !L ? "#f3c623" : correct === "ANY" || !correct ? "#4aa3ff" : L === correct ? "#2ecc71" : "#ff5a3c";
    x.lineWidth = Math.max(2, cv.width / 300); x.strokeStyle = col; x.beginPath();
    it.corners.forEach((p, i) => (i ? x.lineTo : x.moveTo).call(x, p.x * k, p.y * k)); x.closePath(); x.stroke();
    const cxp = it.corners.reduce((a, p) => a + p.x, 0) / 4 * k, cyp = it.corners.reduce((a, p) => a + p.y, 0) / 4 * k;
    const label = (enrolled ? st.name.split(" ")[0] : "#" + it.card) + " " + (L || "?");
    x.font = `bold ${Math.max(12, cv.width / 55)}px system-ui, sans-serif`; const w = x.measureText(label).width;
    x.fillStyle = "rgba(0,0,0,.7)"; x.fillRect(cxp - w / 2 - 4, cyp - 12, w + 8, 22); x.fillStyle = col; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(label, cxp, cyp);
  }
}

function viewRoster() {
  const c = curClass(), sts = students();
  const pc = perClass(S.data);
  const rows = sts.map(s => {
    if (S.rosterEdit === s.id) return `<div class="srow" style="grid-template-columns:1fr">
      <div class="grid2"><label class="f">Name<input type="text" id="reName" value="${esc(s.name)}"></label>
      <label class="f">${pc ? "Card number" : "Card number (same in every class)"}<select id="reCard">${((taken) => Array.from({ length: MAX_CARDS }, (_, i) => i + 1).map(n => `<option value="${n}" ${n === s.card ? "selected" : ""} ${taken.has(n) && n !== s.card ? "disabled" : ""}>${n}${taken.has(n) && n !== s.card ? ` — ${esc(taken.get(n))}` : ""}</option>`).join(""))(cardHolders(S.data, s.id))}</select></label></div>
      <div class="row"><button class="btn sm primary" data-act="resave" data-sid="${s.id}">Save</button><button class="btn sm" data-act="recancel">Cancel</button>
      ${S.confirm === "rm:" + s.id ? `<span class="sub">Take ${esc(s.name)} off the ${esc(c.name)} roster? They keep card #${s.card} and their past answers.</span><button class="btn sm danger" data-act="rm2" data-sid="${s.id}">Remove from class</button>` : `<button class="btn sm danger" data-act="rm" data-sid="${s.id}">Remove from class…</button>`}</div></div>`;
    return `<div class="srow"><span class="card">#${s.card}</span><span class="name">${esc(s.name)}</span><button class="btn sm" data-act="redit" data-sid="${s.id}">Edit</button></div>`;
  }).join("");
  return `${banner()}
  <div><h2>${esc(c?.name || "")} roster</h2><p class="sub">${plural(sts.length, "student")} in this class · ${pc ? `${sts.length} of ${MAX_CARDS} cards in use in this class. Each class has its own card numbers.` : `${Object.keys(S.data.students).length} of ${MAX_CARDS} cards in use across all classes. Each student has one card number in every class.`}</p></div>
  <div class="panel">
    <h3>Add students</h3>
    ${S.rImport ? viewRImport() : S.addPlan ? viewAddPlan() : `<div class="row"><button class="btn" data-act="rupload">Upload a roster (CSV)</button><span class="sub">Columns: <b>name</b>, and if you like <b>class</b> and <b>card</b>.</span></div>
    <label class="f">One name per line. Paste from your gradebook.<textarea id="addNames" placeholder="First Last&#10;First Last"></textarea></label>
    <div class="row"><button class="btn primary" data-act="addnames">Add to roster</button><span class="sub">New students get the lowest free card number${pc ? " in this class" : ". Students already in another class keep theirs"}.</span></div>`}
  </div>
  ${viewExisting()}
  ${sts.length ? `<div class="roster">${rows}</div>` : `<div class="panel empty"><b>No students in ${esc(c?.name || "this class")} yet</b><span>Paste your class list above, one name per line, or upload a roster file.${notInClass(S.data, S.cls).length ? " Students from your other classes are under <b>Add existing students</b>: they keep their card numbers." : ""} Each new student gets the next free card number.</span><span>Names stay on this phone. Nothing is uploaded.</span></div>`}
  <div class="panel"><h3>Class name</h3><div class="row" style="flex-wrap:nowrap"><input type="text" id="className" aria-label="Class name" value="${esc(c?.name || "")}"><button class="btn" data-act="rename">Rename</button></div>
    ${classList().length < 2 ? "" : S.confirm === "hidecls" ? `<div class="row"><span class="sub">Hide ${esc(c?.name)}? Its students and bell work are kept. Bring it back any time from <b>+ Add class</b>.</span><button class="btn sm danger" data-act="hidecls2">Hide class</button><button class="btn sm" data-act="cancelconfirm">Cancel</button></div>`
      : `<div class="row"><button class="btn sm" data-act="hidecls">Hide this class…</button></div>`}</div>`;
}

// Shown when pasted names match students already in the app.
function viewAddPlan() {
  const rows = S.addPlan.map((r, i) => {
    if (r.inClass && r.choice === "same") return `<div class="match"><span><b>${esc(r.name)}</b> is already in this class (card #${r.inClass.card}).</span></div>`;
    if (!r.match.length) return `<div class="match"><span><b>${esc(r.name)}</b> — new student, gets the next free card.</span></div>`;
    const m = r.match[0];
    return `<div class="match"><span><b>${esc(m.name)}</b> — already card #${m.card}. Same student?</span>
      <div class="seg"><button class="btn sm" data-act="plan" data-i="${i}" data-c="same" aria-pressed="${r.choice === "same"}">Same student</button><button class="btn sm" data-act="plan" data-i="${i}" data-c="new" aria-pressed="${r.choice === "new"}">Different student</button></div></div>`;
  }).join("");
  return `<div>${rows}</div><div class="row"><button class="btn primary" data-act="addconfirm">Add ${plural(S.addPlan.length, "student")}</button><button class="btn" data-act="addcancel">Cancel</button></div>`;
}

function viewExisting() {
  const others = notInClass(S.data, S.cls);
  if (!others.length) return "";
  if (!S.existing) return `<div><button class="btn" data-act="existing">Add existing students (${others.length})…</button></div>`;
  const f = S.existing.filter.trim().toLowerCase();
  const list = others.filter(s => !f || s.name.toLowerCase().includes(f) || String(s.card) === f);
  return `<div class="panel"><h3>Add existing students</h3>
    <input type="text" id="exFilter" placeholder="Search by name or card number" value="${esc(S.existing.filter)}" aria-label="Search students">
    <div class="picklist">${list.map(s => `<label class="check"><input type="checkbox" data-act="exsel" value="${s.id}" ${S.existing.sel.includes(s.id) ? "checked" : ""}> #${s.card} ${esc(s.name)}</label>`).join("") || `<span class="sub">No match.</span>`}</div>
    <div class="row"><button class="btn primary" data-act="exadd" ${S.existing.sel.length ? "" : "disabled"}>Add ${plural(S.existing.sel.length, "student")}</button><button class="btn" data-act="excancel">Close</button></div></div>`;
}

function curReportSets() { return reportSets(classSets(), S.report.range, S.report.chosen); }
function viewReports() {
  const sets = curReportSets(), sts = students(), r = S.report;
  const rangeBtns = [["week", "This week"], ["last", "Last week"], ["all", "All"], ["pick", "Choose…"]].map(([k, l]) => `<button class="btn sm ${r.range === k ? "dark" : ""}" data-act="range" data-r="${k}" aria-pressed="${r.range === k}">${l}</button>`).join("");
  const picker = r.range === "pick" ? `<div class="panel" style="gap:0">${sortSets(classSets()).map(s => `<label class="check"><input type="checkbox" data-act="choose" value="${s.id}" ${r.chosen.includes(s.id) ? "checked" : ""}> ${esc(fmtDay(s.date).long)} · ${esc(s.title)}</label>`).join("") || `<span class="sub">No sets yet.</span>`}</div>` : "";
  const anySets = Object.keys(classSets()).length;
  const scanned = sets.some(s => Object.values(s.answers || {}).some(qa => Object.keys(qa).length));
  const empty = !sts.length ? [`No students in ${esc(curClass()?.name)} yet`, "Reports show each student's bell work scores. Add students first.", goTab("roster", "Go to Roster")]
    : !anySets ? ["No bell work yet", "Make a bell work set and scan the room. Scores show up here right away.", goTab("sets", "Go to Bell work")]
    : !sets.length ? ["Nothing in this range", r.range === "pick" ? "Tick the sets you want above." : `No bell work sets ${r.range === "week" ? "this week" : "last week"}.`, r.range === "pick" ? "" : `<button class="btn" data-act="range" data-r="all">Show all sets</button>`]
    : !scanned ? ["Nothing scanned yet", "These sets have no answers yet. Open one on Bell work and tap Live scan.", goTab("sets", "Go to Bell work")] : null;
  if (empty) return `<div class="row spread"><h2>Reports</h2></div><div class="row">${rangeBtns}</div>${picker}
    <div class="panel empty"><b>${empty[0]}</b><span>${empty[1]}</span>${empty[2]}</div>`;
  const rows = reportRows(sets, sts);
  let totC = 0, totG = 0;
  const body = rows.map(row => {
    totC += row.correct; totG += row.graded;
    const cells = row.cells.map(x => !x ? `<td class="sub">absent</td>` : x.graded ? `<td class="${x.correct / x.graded < 0.6 ? "lo" : ""}">${x.correct}/${x.graded}</td>` : `<td>✓</td>`).join("");
    return `<tr><td class="n">${esc(row.student.name)}</td>${cells}<td class="${row.pct !== null && row.pct < 60 ? "lo" : ""}"><b>${row.pct === null ? "—" : row.pct + "%"}</b></td><td><b>${row.points === null ? "—" : row.points.toFixed(1)}</b></td></tr>`;
  }).join("");
  const avgRow = `<tr class="avg"><td class="n">Class</td>${sets.map(s => { const p = setPct(s, sts); return `<td>${p === null ? "—" : p + "%"}</td>`; }).join("")}<td>${totG ? Math.round(100 * totC / totG) + "%" : "—"}</td><td></td></tr>`;
  const head = `<tr><th class="n">Student</th>${sets.map(s => { const d = fmtDay(s.date); return `<th>${esc(d.dow)} ${d.day}</th>`; }).join("")}<th>Overall</th><th>/10</th></tr>`;
  const reteach = reteachList(sets, sts);
  const rt = reteach.length ? reteach.map(x => `<div class="check" style="flex-wrap:wrap"><span class="ans ${x.pct >= 70 ? "ok" : "bad"}">${x.pct}%</span><span><b>${esc(fmtDay(x.set.date).long)} Q${x.q + 1}</b>${x.text ? " · " + esc(x.text) : ""} <span class="sub">(${x.n} answered)</span></span></div>`).join("") : `<span class="sub">No graded questions scanned in this range.</span>`;
  return `<div class="row spread"><h2>Reports</h2></div>
  <div class="row">${rangeBtns}</div>${picker}
  <div class="tablewrap"><table><thead>${head}</thead><tbody>${body}${avgRow}</tbody></table></div>
  <p class="sub">Only questions you've scanned count. A student with no answers that day is marked absent and left out; a missed question on a day they were there counts as wrong. Survey questions count as participation only. Scores under 60% are marked.</p>
  <div class="panel" style="gap:0"><h3 style="margin-bottom:6px">Questions to reteach</h3>${rt}</div>
  <div class="row"><button class="btn primary" data-act="csvsum">Download scores (CSV)</button><button class="btn" data-act="csvdet">Download every answer (CSV)</button></div>`;
}

function viewCards() {
  const R = S.restore;
  const restoreNote = R ? `<div class="note">${R.error ? esc(R.error) : `Backup${R.exported ? " from " + esc(new Date(R.exported).toLocaleString()) : ""}${R.version === 1 ? " (from the first version of the app)" : ""}: ${plural(Object.keys(R.data.students).length, "student")}, ${plural(Object.values(R.data.sets).reduce((a, s) => a + Object.keys(s).length, 0), "bell work set")}. <b>Restoring replaces everything on this phone.</b>
      ${R.changes.length ? `<div style="margin-top:6px">Card numbers that change (hand out these cards):<ul class="changes">${R.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
      <div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="restore2">Restore</button><button class="btn sm" data-act="restorecancel">Cancel</button></div>`}</div>` : "";
  // After a restore, the card numbers that changed stay listed until dismissed, so the right cards get handed out.
  const restoredNote = S.restored?.length ? `<div class="note">Backup restored. <b>Card numbers that changed</b> (hand out these cards):<ul class="changes">${S.restored.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="restoredok">Done, cards handed out</button></div></div>` : "";
  const pc = perClass(S.data);
  return `<div><h2>Answer cards</h2><p class="sub">One set of ${MAX_CARDS} cards works for every class. ${pc ? "Each class has its own card numbers." : "Each student has one card number, the same in every class."}</p></div>
  <div class="panel">
    <a class="scanbtn" href="${cardsPdfUrl}" download="STCS_Answer_Cards_1-40.pdf">Download cards 1–40 (PDF)</a>
    <ol class="steps">
      <li>Print single-sided, one card per page. Cardstock lasts longer; don't laminate glossy (glare hides the pattern).</li>
      <li>Hand each student the card with their number. Keep a class set in a folder.</li>
      <li>To answer, students turn the card so their letter is <b>at the top</b>, and hold it up facing you.</li>
    </ol>
  </div>
  <div class="panel"><h3>Scanning tips</h3>
    <ul class="steps">
      <li>Tap <b>Live scan</b>, stand at the front, and slowly sweep the phone across the room. Hold it upright and level: the app reads "up" from the camera. Names fill in as cards are read.</li>
      <li>Good light matters more than distance. Turn on the lights; avoid a bright window behind the students.</li>
      <li>Missed a few? Tap <b>Missing</b> to see who. A second scan or photo adds the cards it reads without erasing the others.</li>
      <li>Cards tilted more than about a third of a turn are skipped rather than guessed. The app tells you whose.</li>
      <li>Cards in the back row not reading? In the live scan, tap ⚙ and choose <b>Far</b> (4K), if your phone offers it.</li>
      <li>Showing the class? Open a set, tap <b>Projector view</b>, and mirror (Cast) the phone to the classroom screen. It shows the question and how many have answered, never names.</li>
    </ul></div>
  <div class="panel"><h3>Backup</h3>
    <p class="sub" style="margin:0">Your data is saved on this phone only. Download a backup each week, and restore it if you switch phones or clear your browser. Old backups from the first version of the app work too.</p>
    <p class="sub" style="margin:0">${S.data.settings?.backedUp ? `Last backup from this phone: <b>${esc(new Date(S.data.settings.backedUp).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}</b>.` : "No backup made on this phone yet."} The app reminds you if it's been a week.</p>
    <div class="row"><button class="btn primary" data-act="backup">Download backup</button><button class="btn" data-act="restore">Restore from backup…</button></div>
    ${restoreNote}${restoredNote}
  </div>
  <div class="panel"><h3>Card numbers</h3>
    <label class="check"><input type="radio" name="cardmode" value="app" ${pc ? "" : "checked"}> <span><b>One card per student, in every class.</b> A student in two classes keeps one number. Up to ${MAX_CARDS} students in all.</span></label>
    <label class="check"><input type="radio" name="cardmode" value="class" ${pc ? "checked" : ""}> <span><b>Each class uses cards 1–${MAX_CARDS}.</b> For more than ${MAX_CARDS} students. Card 7 in one class and card 7 in another are different students.</span></label>
    ${S.cardModeErr ? `<div class="note">To use one card per student, these students need different numbers first (change them on the Roster tab):<ul class="changes">${S.cardModeErr.map(d => `<li>${esc(d)}</li>`).join("")}</ul></div>` : ""}
  </div>
  <div class="panel"><h3>Home screen</h3>
    ${installed() ? `<p class="sub" style="margin:0">Card Scan is installed. It opens from your home screen and works with no internet.</p>`
      : `<p class="sub" style="margin:0">Put Card Scan on your home screen. It opens like an app and works with no internet, even in airplane mode.</p>
    ${installPrompt ? `<div class="row"><button class="btn primary" data-act="install">Add to home screen</button></div>`
      : `<p class="sub" style="margin:0">In Chrome, tap the <b>⋮</b> menu, then <b>Add to home screen</b> (or <b>Install app</b>).</p>`}`}
  </div>`;
}

// ---------- events ----------
document.addEventListener("click", e => {
  const chip = e.target.closest("[data-cls]");
  if (chip) { S.cls = chip.dataset.cls; S.newClass = null; lsSet("cls", S.cls); Object.assign(S, { openSet: null, newSet: null, lastScan: null, pick: null, addPlan: null, existing: null, rosterEdit: null, confirm: null, rImport: null }); if (S.qImport) S.qImport.dec = {}; S.report.chosen = []; render(); return; }
  const tab = e.target.closest("#tabs [data-tab]");
  if (tab) { S.tab = tab.dataset.tab; S.newClass = null; lsSet("tab", S.tab); S.confirm = null; render(); window.scrollTo(0, 0); return; }
  const open = e.target.closest("[data-open]");
  if (open) { Object.assign(S, { openSet: open.dataset.open, q: 0, pick: null, editing: false, lastScan: null }); render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest("[data-act]"); if (!b || b.type === "checkbox") return;
  const act = b.dataset.act, set = curSet(), c = curClass();
  switch (act) {
    case "newset": S.newSet = { title: "Bell work", date: todayISO(), questions: Array.from({ length: 4 }, () => ({ text: "", correct: "" })) }; render(); window.scrollTo(0, 0); break;
    case "nscancel": S.newSet = null; render(); break;
    case "nsadd": S.newSet.questions.push({ text: "", correct: "" }); render(); break;
    case "nsdel": S.newSet.questions.splice(+b.dataset.i, 1); render(); break;
    case "nscorrect": S.newSet.questions[+b.dataset.i].correct = b.dataset.l; render(); break;
    case "nsparse": { const parsed = parsePaste($("#nsPaste").value); if (!parsed.length) { toast("Couldn't find any questions or letters in that text."); break; } S.newSet.questions = parsed; render(); toast(`Filled in ${plural(parsed.length, "question")}.`); break; }
    case "nssave": {
      const ns = S.newSet; if (!ns.questions.length) break;
      const id = uid();
      classSets()[id] = { title: ns.title.trim() || "Bell work", date: ns.date || todayISO(), questions: ns.questions.map(q => { const ch = (q.choices || []).map(x => x.trim()); return { text: q.text.trim(), ...(ch.some(Boolean) ? { choices: [0, 1, 2, 3].map(j => ch[j] || "") } : {}), correct: q.correct || "" }; }), answers: {}, created: Date.now(), updated: Date.now() };
      Object.assign(S, { newSet: null, openSet: id, q: 0, lastScan: null }); commit(); window.scrollTo(0, 0); break; }
    case "back": Object.assign(S, { openSet: null, editing: false, confirm: null }); render(); break;
    case "q": S.q = +b.dataset.i; S.pick = null; render(); break;
    case "correct": if (set) { set.questions[S.q].correct = b.dataset.l; saveSet(set); } break;
    case "live": startLive(); break;
    case "scan": $("#camIn").value = ""; $("#camIn").click(); break;
    case "pickphoto": $("#picIn").value = ""; $("#picIn").click(); break;
    case "turn": if (set && S.lastScan) { const prev = S.lastScan.turn; S.lastScan.turn = (prev + 1) % 4; applyScan(set, S.lastScan, prev); toast("Turned answers a quarter turn"); } break;
    case "enrollscan": if (set && S.lastScan) { enroll(S.data, S.cls, [b.dataset.sid]); (S.lastScan.live ? applyLive : applyScan)(set, S.lastScan); toast("Added to " + c.name); } break;
    case "pick": S.pick = S.pick === b.dataset.sid ? null : b.dataset.sid; render(); break;
    case "setans": if (set) { const qa = { ...(set.answers?.[S.q] || {}) }; if (b.dataset.l) qa[b.dataset.sid] = b.dataset.l; else delete qa[b.dataset.sid]; set.answers = { ...(set.answers || {}), [S.q]: qa }; S.pick = null; saveSet(set); } break;
    case "editset": S.editing = !S.editing; S.confirm = null; render(); break;
    case "esadd": if (set) { set.questions.push({ text: "", correct: "" }); S.q = set.questions.length - 1; saveSet(set); } break;
    case "esdelq": if (set && set.questions.length > 1) { const ans = {}; set.questions.splice(S.q, 1); set.questions.forEach((_, i) => { const from = i < S.q ? i : i + 1; if (set.answers?.[from]) ans[i] = set.answers[from]; }); set.answers = ans; S.q = Math.max(0, S.q - 1); S.lastScan = null; saveSet(set); } break;
    case "esclearq": if (set) { const a = { ...(set.answers || {}) }; delete a[S.q]; set.answers = a; S.lastScan = null; saveSet(set); toast(`Cleared Q${S.q + 1}`); } break;
    case "delset": S.confirm = "delset"; render(); break;
    case "delset2": if (set) { delete classSets()[S.openSet]; Object.assign(S, { openSet: null, editing: false, confirm: null }); commit(); toast("Set deleted"); } break;
    case "cancelconfirm": S.confirm = null; render(); break;
    case "addnames": {
      const names = parseNames($("#addNames").value);
      if (!names.length) { toast("Paste at least one name."); break; }
      const plan = planAdd(S.data, S.cls, names);
      if (plan.some(r => r.match.length)) { S.addPlan = plan; render(); break; }
      finishAdd(plan); break; }
    case "plan": S.addPlan[+b.dataset.i].choice = b.dataset.c; render(); break;
    case "addconfirm": finishAdd(S.addPlan); break;
    case "hidecls": S.confirm = "hidecls"; render(); break;
    case "hidecls2": { const name = c.name; c.archived = true; S.confirm = null; S.cls = classList()[0].id; lsSet("cls", S.cls); commit(); toast(`${name} is hidden`); break; }
    case "unhide": { const id = b.dataset.cid; S.data.classes[id].archived = false; S.data.classes[id].order = Math.max(0, ...Object.values(S.data.classes).map(x => x.order || 0)) + 1; Object.assign(S, { newClass: null, cls: id }); lsSet("cls", id); commit(); toast(`${S.data.classes[id].name} is back`); break; }
    case "setup2": finishSetup(); break;
    case "setupskip": S.setup = false; commit(); break;
    case "addclass": S.newClass = ""; render(); $("#newClassName")?.focus(); break;
    case "addclass2": newClass(); break;
    case "addclasscancel": S.newClass = null; render(); break;
    case "addcancel": S.addPlan = null; render(); break;
    case "qupload": $("#qcsvIn").value = ""; $("#qcsvIn").click(); break;
    case "qcancel": S.qImport = null; render(); break;
    case "qdec": S.qImport.dec[b.dataset.k] = b.dataset.c; render(); break;
    case "qimport": {
      const p = qImportPlan(), r = applyQuestions(S.data, p, S.qImport.dec);
      const classes = [...new Set(p.sets.map(x => x.classId))];
      S.qImport = null;
      if (classes.length === 1 && classes[0] !== S.cls) { S.cls = classes[0]; lsSet("cls", S.cls); }
      commit();
      toast([r.added && `Added ${plural(r.added, "set")}`, r.replaced && `replaced ${plural(r.replaced, "set")}`].filter(Boolean).join(", ") + ` · ${plural(r.questions, "question")}`);
      break; }
    case "qdownclass": download(csvName(c.name, "questions", todayISO()), questionsCSV(sortSets(classSets()).map(set => ({ className: c.name, set }))), "text/csv"); break;
    case "qdownset": if (set) download(csvName(c.name, set.date, set.title), questionsCSV([{ className: c.name, set }]), "text/csv"); break;
    case "rupload": $("#rcsvIn").value = ""; $("#rcsvIn").click(); break;
    case "rcancel": S.rImport = null; render(); break;
    case "rdec": S.rImport.dec[b.dataset.row] = b.dataset.c; render(); break;
    case "rimport": {
      const r = applyRoster(S.data, rImportPlan());
      S.rImport = null; commit();
      toast([r.added && `Added ${plural(r.added, "new student")}`, r.enrolled && `${r.enrolled} already had cards`, r.already && `${r.already} already in the class`].filter(Boolean).join(" · ") || "No changes");
      break; }
    case "existing": S.existing = { filter: "", sel: [] }; render(); break;
    case "excancel": S.existing = null; render(); break;
    case "exadd": enroll(S.data, S.cls, S.existing.sel); toast(`Added ${plural(S.existing.sel.length, "student")}`); S.existing = null; commit(); break;
    case "redit": S.rosterEdit = b.dataset.sid; S.confirm = null; render(); break;
    case "recancel": S.rosterEdit = null; S.confirm = null; render(); break;
    case "resave": {
      const id = b.dataset.sid, r1 = renameStudent(S.data, id, $("#reName").value);
      if (!r1.ok) { toast(r1.reason); break; }
      const r2 = setCard(S.data, id, +$("#reCard").value);
      if (!r2.ok) { toast(r2.reason); break; }
      S.rosterEdit = null; commit(); toast("Saved"); break; }
    case "rm": S.confirm = "rm:" + b.dataset.sid; render(); break;
    case "rm2": unenroll(S.data, S.cls, b.dataset.sid); S.rosterEdit = null; S.confirm = null; commit(); toast("Removed from " + c.name); break;
    case "rename": { const n = $("#className").value.trim(); if (n) { c.name = n; commit(); toast("Renamed"); } break; }
    case "range": S.report.range = b.dataset.r; render(); break;
    case "csvsum": case "csvdet": exportCSV(act === "csvdet"); break;
    case "backup": {
      const st = (S.data.settings ||= {}); st.backedUp = Date.now(); delete st.backupSnooze;
      download(`STCS_Card_Scan_backup_${todayISO()}.json`, JSON.stringify(buildBackup(S.data)), "application/json"); commit(); break; }
    case "backupsnooze": (S.data.settings ||= {}).backupSnooze = Date.now() + 24 * 3600 * 1000; commit(); toast("Backup reminder snoozed until tomorrow"); break;
    case "gotab": S.tab = b.dataset.t; lsSet("tab", S.tab); S.confirm = null; render(); window.scrollTo(0, 0); $(`#tabs [data-tab="${S.tab}"]`)?.focus(); break;
    case "projopen": S.proj = true; S.projReveal = false; render(); break;
    case "projclose": S.proj = false; render(); $("#view [data-act='projopen']")?.focus({ preventScroll: true }); break;
    case "projprev": case "projnext": S.q = Math.max(0, Math.min((set?.questions.length || 1) - 1, S.q + (act === "projnext" ? 1 : -1))); S.projReveal = false; S.pick = null; render(); break;
    case "projreveal": S.projReveal = !S.projReveal; render(); break;
    case "restore": $("#restoreIn").value = ""; $("#restoreIn").click(); break;
    case "restore2": if (S.restore?.data) { S.data = S.restore.data; (S.data.settings ||= {}).started ||= Date.now(); S.restored = S.restore.changes; S.setup = false; S.restore = null; if (!S.data.classes[S.cls]) S.cls = "math8"; commit(); toast("Backup restored"); } break;
    case "install": installPrompt?.prompt(); installPrompt?.userChoice.finally(() => { installPrompt = null; render(); }); break;
    case "update": S.update?.waiting?.postMessage("update"); break;
    case "restoredok": S.restored = null; render(); break;
    case "restorecancel": S.restore = null; render(); break;
  }
});

function finishAdd(plan) {
  const r = applyAdd(S.data, S.cls, plan);
  S.addPlan = null; commit();
  const parts = [];
  if (r.added.length) parts.push(`Added ${plural(r.added.length, "new student")}`);
  if (r.enrolled.length) parts.push(r.enrolled.length === 1 ? `${r.enrolled[0].name} — already card #${r.enrolled[0].card}` : `${r.enrolled.length} already had cards`);
  if (r.already.length) parts.push(`${r.already.length} already in this class`);
  if (r.full.length) parts.push(`all ${MAX_CARDS} cards are in use, so ${plural(r.full.length, "name")} weren't added`);
  toast(parts.join(" · ") || "No changes");
}

function exportCSV(detail) {
  const sets = curReportSets(), sts = students(), c = curClass();
  if (!sets.length || !sts.length) { toast("Nothing to export in this range."); return; }
  const name = `${(c?.name || "class").replace(/[^A-Za-z0-9]+/g, "_")}_${detail ? "answers" : "scores"}_${todayISO()}.csv`;
  download(name, detail ? answersCSV(sets, sts) : scoresCSV(sets, sts), "text/csv");
}

document.addEventListener("change", async e => {
  const t = e.target;
  if (t.id === "camIn" || t.id === "picIn") { handlePhoto(t.files?.[0]); return; }
  if (t.id === "qcsvIn" || t.id === "rcsvIn") {
    const f = t.files?.[0]; if (!f) return;
    const text = await f.text(), up = { name: f.name, text, classMap: {}, dec: {} };
    if (t.id === "qcsvIn") { S.qImport = up; S.newSet = null; S.openSet = null; } else { S.rImport = up; S.addPlan = null; }
    render(); return;
  }
  if (t.dataset.qmap !== undefined || t.dataset.rmap !== undefined) {
    const I = t.dataset.qmap !== undefined ? S.qImport : S.rImport, k = t.dataset.qmap ?? t.dataset.rmap;
    if (t.value === "__new") { I.classMap[k] = addClass(S.data, k); commit(); toast(`Added the class ${k}`); return; }
    if (t.value) I.classMap[k] = t.value === "__skip" ? "" : t.value; else delete I.classMap[k];
    render(); return;
  }
  if (t.name === "cardmode") {
    const r = setCardMode(S.data, t.value);
    S.cardModeErr = r.ok ? null : r.dups;
    if (r.ok) { commit(); toast(t.value === "class" ? "Each class now uses cards 1–" + MAX_CARDS : "One card per student, in every class"); } else render();
    return;
  }
  if (t.id === "restoreIn") {
    const f = t.files?.[0]; if (!f) return;
    try { const text = await f.text(); S.restore = { ...readBackup(text), exported: JSON.parse(text).exported }; }
    catch (err) { S.restore = null; toast(err.message); }
    render(); return;
  }
  if (t.dataset.act === "choose") { const ch = new Set(S.report.chosen); t.checked ? ch.add(t.value) : ch.delete(t.value); S.report.chosen = [...ch]; render(); return; }
  if (t.dataset.act === "exsel") { const ch = new Set(S.existing.sel); t.checked ? ch.add(t.value) : ch.delete(t.value); S.existing.sel = [...ch]; render(); return; }
  if (t.dataset.es) {
    const set = curSet(); if (!set) return;
    if (t.dataset.es === "title") set.title = t.value.trim() || "Bell work";
    if (t.dataset.es === "date") set.date = t.value || set.date;
    if (t.dataset.es === "qtext") set.questions[S.q].text = t.value.trim();
    if (t.dataset.es === "choice") {
      const q = set.questions[S.q], ch = [0, 1, 2, 3].map(j => q.choices?.[j] || "");
      ch[+t.dataset.j] = t.value.trim();
      if (ch.some(Boolean)) q.choices = ch; else delete q.choices;
    }
    saveSet(set);
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "exFilter") { S.existing.filter = t.value; render(); const f = $("#exFilter"); f.focus(); f.setSelectionRange(t.value.length, t.value.length); return; }
  if (!t.dataset.ns || !S.newSet) return;
  if (t.dataset.ns === "text") S.newSet.questions[+t.dataset.i].text = t.value;
  else if (t.dataset.ns === "choice") { const q = S.newSet.questions[+t.dataset.i]; (q.choices ||= ["", "", "", ""])[+t.dataset.j] = t.value; }
  else S.newSet[t.dataset.ns] = t.value;
});

// First visit: replace the example classes with the teacher's own, and pick how card numbers work.
function finishSetup() {
  const names = parseNames($("#setupClasses").value);
  if (!names.length) { toast("Type at least one class name, or use the example classes."); return; }
  const mode = document.querySelector('input[name="setupCards"]:checked')?.value || "app";
  for (const [id, c] of Object.entries(S.data.classes))
    if (!c.studentIds.length && !Object.keys(S.data.sets[id] || {}).length) delete S.data.classes[id];
  const ids = names.map(n => { try { return addClass(S.data, n); } catch { return null; } }).filter(Boolean);
  setCardMode(S.data, mode);
  Object.assign(S, { setup: false, cls: ids[0] || classList()[0].id, tab: "roster" });
  lsSet("cls", S.cls); lsSet("tab", "roster");
  commit(); toast(`${ids.length === 1 ? "1 class" : ids.length + " classes"} ready. Add your students.`);
}

function newClass() {
  const name = $("#newClassName").value;
  try {
    const id = addClass(S.data, name);
    Object.assign(S, { newClass: null, cls: id, tab: "roster", openSet: null, newSet: null, lastScan: null, pick: null, addPlan: null, existing: null, rosterEdit: null, confirm: null, rImport: null });
    lsSet("cls", id); lsSet("tab", "roster");
    commit(); toast(`Added ${S.data.classes[id].name}. Now add its students.`);
    $(".chip[aria-pressed='true']")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  } catch (err) { S.newClass = name; render(); toast(err.message); }
}
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "newClassName") newClass();
  // projector view on a computer: arrow keys change the question, Escape closes
  if (S.proj && !document.body.classList.contains("living")) {
    const act = { ArrowLeft: "projprev", ArrowRight: "projnext", Escape: "projclose" }[e.key];
    const b = act && $(`#proj [data-act="${act}"]:not(:disabled)`);
    if (b) { e.preventDefault(); b.click(); }
  }
});

// ---------- home screen and offline ----------
// The service worker (src/sw.js) keeps the app's files on the phone so it opens with no internet.
// It's only in the built app; `npm run dev` runs without it so changes show up right away.
let installPrompt = null;
const installed = () => matchMedia("(display-mode: standalone)").matches;
const rerender = () => { if (S.data) render(); };
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; rerender(); });
window.addEventListener("appinstalled", () => { installPrompt = null; rerender(); toast("Card Scan is on your home screen"); });
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(reg => {
    const check = () => { if (reg.waiting && navigator.serviceWorker.controller) { S.update = reg; rerender(); } };
    check();
    reg.addEventListener("updatefound", () => reg.installing?.addEventListener("statechange", check));
  }).catch(() => { /* no offline copy this time; the app still works online */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (S.update && !reloading) { reloading = true; location.reload(); } });
}

// ---------- start ----------
(async () => {
  const { data, mode, fresh } = await load();
  S.data = data; S.mode = mode; S.setup = fresh && mode === "device";
  // when this phone started keeping data, for the weekly backup reminder (saved with the next change on a first visit)
  if (!(S.data.settings ||= {}).started) { S.data.settings.started = Date.now(); if (!fresh && mode === "device") save(S.data).catch(() => {}); }
  if (!S.data.classes[S.cls]) S.cls = "math8";
  setSync(); render();
})();
