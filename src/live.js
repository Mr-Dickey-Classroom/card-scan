// Live camera scanning: the full-screen view. Frames go to a Web Worker for detection; answers count
// after 2 matching frames (debounce.js). Nothing is saved until Done, when onDone gets the reads.
import { createDebouncer } from "./debounce.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const firstName = n => String(n).trim().split(/\s+/)[0];
const MAX_SIDE = 1920; // frames sent to the worker are capped at 1080p ("Fast")
// Two workers read two frames at once on multi-core phones, nearly doubling detections per second.
const WORKERS = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));

// opts: { title, correct, students: [{ id, name, card }], existing: { studentId: letter },
//   lookup(card) → { student, enrolled }, settings: { hideColors, debug }, saveSettings(s),
//   onDone({ reads: [{ card, letter }], tilted: [card] }), onCancel(), onPhoto() }
export function openLive(opts) {
  const { students, lookup, settings } = opts;
  const answers = new Map(Object.entries(opts.existing || {})); // studentId → letter, shown in progress
  const fresh = new Set();     // studentIds read during this scan (newest last)
  const everTilted = new Set();
  const deb = createDebouncer(2);
  let stream = null, wakeLock = null, closed = false, seq = 0, lastSeq = 0, mirrored = false;
  const workers = [], idle = [];
  let grab = null, gctx = null, last = null, rates = [], lastMs = 0, drawerOpen = false;

  const el = document.createElement("div");
  el.className = "live"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Live scan");
  el.innerHTML = `
    <video playsinline muted autoplay></video>
    <canvas class="ov" aria-hidden="true"></canvas>
    <div class="ltop">
      <button class="lbtn" data-l="cancel" aria-label="Close without saving">✕</button>
      <div class="lprog"><div class="lq"></div><div class="lbar"><span></span></div><div class="lcount" aria-live="polite"></div></div>
      <button class="lbtn" data-l="settings" aria-label="Scan settings" aria-expanded="false">⚙</button>
    </div>
    <div class="lpanel lsettings" hidden>
      <label class="check"><input type="checkbox" data-s="hideColors"> Hide right/wrong colors</label>
      <label class="check"><input type="checkbox" data-s="debug"> Show detection speed</label>
    </div>
    <div class="lpanel lconfirm" hidden></div>
    <div class="lmsg" hidden></div>
    <div class="ldebug" hidden></div>
    <div class="lhint" hidden></div>
    <div class="lbottom">
      <div class="lchips" aria-label="Answered"></div>
      <div class="lrow"><button class="lbtn wide" data-l="missing" aria-expanded="false"></button><button class="lbtn wide primary" data-l="done">Done</button></div>
    </div>
    <div class="ldrawer" hidden></div>`;
  document.body.append(el);
  document.body.classList.add("living");
  const $ = s => el.querySelector(s);
  const video = $("video"), ov = $(".ov");
  for (const cb of el.querySelectorAll("[data-s]")) cb.checked = !!settings[cb.dataset.s];

  // ---------- drawing the bars, chips and drawer ----------
  const colorOf = L => !L || settings.hideColors ? "" : opts.correct === "ANY" || !opts.correct ? "any" : L === opts.correct ? "ok" : "bad";
  function paint() {
    const n = students.length, done = students.filter(s => answers.has(s.id)).length;
    $(".lq").textContent = opts.title + (opts.correct && opts.correct !== "ANY" && !settings.hideColors ? ` · Correct: ${opts.correct}` : "");
    $(".lbar span").style.width = n ? `${Math.round(100 * done / n)}%` : "0";
    $(".lcount").textContent = `${done} / ${n} answered`;
    const missing = students.filter(s => !answers.has(s.id));
    const m = $('[data-l="missing"]'); m.textContent = `Missing (${missing.length})`; m.setAttribute("aria-expanded", String(drawerOpen));
    const byId = new Map(students.map(s => [s.id, s]));
    $(".lchips").innerHTML = [...fresh].reverse().map(id => { const s = byId.get(id), L = answers.get(id); return `<span class="lchip ${colorOf(L)}">${esc(firstName(s.name))} <b>${L}</b></span>`; }).join("");
    const d = $(".ldrawer"); d.hidden = !drawerOpen;
    if (drawerOpen) {
      const tiltedNames = students.filter(s => !answers.has(s.id) && everTilted.has(s.card)).map(s => s.name);
      d.innerHTML = `<div class="lrow spread"><b>Not read yet</b><button class="lbtn" data-l="missing">Close</button></div>
        ${missing.length ? `<ul>${missing.map(s => `<li><span class="lcard">#${s.card}</span> ${esc(s.name)}${everTilted.has(s.card) ? ` <i>tilted</i>` : ""}</li>`).join("")}</ul>` : `<p>Everyone is in. Tap Done.</p>`}
        ${tiltedNames.length ? `<p class="lnote">Tilted cards: ask ${esc(tiltedNames.map(firstName).join(", "))} to hold the card straight.</p>` : ""}`;
    }
  }

  function showMsg(html) { const m = $(".lmsg"); m.innerHTML = html; m.hidden = !html; }
  function hint(text) { const h = $(".lhint"); h.textContent = text; h.hidden = false; clearTimeout(hint.t); hint.t = setTimeout(() => h.hidden = true, 4000); }

  // Boxes on each card in the latest frame: name and letter, colored like the chips.
  function drawOverlay() {
    const dpr = window.devicePixelRatio || 1, CW = ov.clientWidth, CH = ov.clientHeight;
    if (ov.width !== Math.round(CW * dpr) || ov.height !== Math.round(CH * dpr)) { ov.width = Math.round(CW * dpr); ov.height = Math.round(CH * dpr); }
    const x = ov.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, CW, CH);
    if (!last || !last.items.length) return;
    // the video fills the screen with object-fit: cover, so map frame pixels the same way
    const k = Math.max(CW / last.w, CH / last.h), ox = (CW - last.w * k) / 2, oy = (CH - last.h * k) / 2;
    const COL = { ok: "#2ecc71", bad: "#ff5a3c", any: "#4aa3ff", "": "#ffffff" };
    for (const it of last.items) {
      const { student: st, enrolled } = lookup(it.card);
      const kept = deb.committed.get(it.card);
      let label, col, thick = true;
      if (!st) { label = `#${it.card}`; col = "#9aa08a"; }
      else if (!enrolled) { label = `#${it.card} not in class`; col = "#f3c623"; }
      else if (!it.letter) { label = `${firstName(st.name)} tilted`; col = "#f3c623"; }
      else { label = `${firstName(st.name)} ${it.letter}`; col = kept === it.letter ? COL[colorOf(it.letter)] : "#ffffff"; thick = kept === it.letter; }
      const pts = it.corners.map(p => ({ x: ox + p.x * k, y: oy + p.y * k }));
      x.lineWidth = thick ? 4 : 2; x.strokeStyle = col; x.beginPath();
      pts.forEach((p, i) => (i ? x.lineTo : x.moveTo).call(x, p.x, p.y)); x.closePath(); x.stroke();
      const cx = pts.reduce((a, p) => a + p.x, 0) / 4, cy = pts.reduce((a, p) => a + p.y, 0) / 4;
      x.font = "bold 17px system-ui, sans-serif"; const w = x.measureText(label).width;
      x.fillStyle = "rgba(0,0,0,.72)"; x.fillRect(cx - w / 2 - 6, cy - 13, w + 12, 26);
      x.fillStyle = col; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(label, cx, cy);
    }
  }

  // ---------- detection loop: one frame in flight per worker ----------
  let queued = false;
  function schedule() {
    if (closed || queued) return;
    queued = true;
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(pump); else requestAnimationFrame(pump);
  }
  function pump() {
    queued = false;
    if (closed || !idle.length) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) { schedule(); return; }
    const k = Math.min(1, MAX_SIDE / Math.max(vw, vh)), w = Math.round(vw * k), h = Math.round(vh * k);
    if (!grab || grab.width !== w || grab.height !== h) {
      grab = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
      gctx = grab.getContext("2d", { willReadFrequently: true });
    }
    gctx.drawImage(video, 0, 0, w, h);
    const img = gctx.getImageData(0, 0, w, h);
    idle.pop().postMessage({ img, seq: ++seq, mirrored }, [img.data.buffer]);
    if (idle.length) schedule();
  }
  function onResult(w, r) {
    idle.push(w);
    if (closed) return;
    if (r.error) console.error("scan worker:", r.error);
    if (r.seq <= lastSeq) { schedule(); return; } // an older frame finished after a newer one: skip it
    lastSeq = r.seq;
    last = r; lastMs = r.ms || 0;
    const now = performance.now(); rates.push(now); rates = rates.filter(t => now - t < 2000);
    const { changes, tilted } = deb.feed(r.items.map(it => ({ card: it.card, letter: it.letter })));
    for (const c of tilted) everTilted.add(c);
    let buzz = false;
    for (const ch of changes) {
      const { student: st, enrolled } = lookup(ch.card);
      if (!st || !enrolled) continue;
      answers.set(st.id, ch.letter); fresh.delete(st.id); fresh.add(st.id); buzz = true;
    }
    if (buzz) { try { navigator.vibrate?.(15); } catch { /* no vibration on this device */ } }
    if (changes.length || tilted.length) paint();
    drawOverlay();
    if (settings.debug) {
      const rate = rates.length > 1 ? (rates.length - 1) / ((rates[rates.length - 1] - rates[0]) / 1000) : 0;
      $(".ldebug").textContent = `${rate.toFixed(1)} detections/s · ${Math.round(lastMs)} ms per frame · ${r.w}×${r.h} · ${workers.length} ${workers.length === 1 ? "worker" : "workers"}`;
    }
    $(".ldebug").hidden = !settings.debug;
    schedule();
  }

  // ---------- camera, worker, wake lock ----------
  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      showMsg(`<b>The camera needs a secure (https) address.</b><p>Open the app from its https link, or use a photo for now.</p><button class="lbtn primary" data-l="photo">Take a photo instead</button>`);
      return;
    }
    showMsg(`<b>Starting the camera…</b>`);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      if (closed) return;
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      showMsg(denied
        ? `<b>Camera permission is off.</b><p>In Chrome, tap the icon left of the address, choose Permissions, and allow Camera. Then try again.</p><div class="lrow"><button class="lbtn primary" data-l="retry">Try again</button><button class="lbtn" data-l="photo">Take a photo instead</button></div>`
        : `<b>Couldn't start the camera.</b><p>${esc(e?.message || "Another app may be using it.")}</p><div class="lrow"><button class="lbtn primary" data-l="retry">Try again</button><button class="lbtn" data-l="photo">Take a photo instead</button></div>`);
      return;
    }
    if (closed) { stream.getTracks().forEach(t => t.stop()); return; }
    const track = stream.getVideoTracks()[0];
    try {
      if (track.getCapabilities?.().focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    } catch { /* focus mode is optional */ }
    mirrored = track.getSettings?.().facingMode === "user"; // a front camera flips B and D
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay with muted + playsinline should be allowed */ }
    showMsg("");
    while (workers.length < WORKERS) {
      const w = new Worker(new URL("./scan-worker.js", import.meta.url), { type: "module" });
      w.onmessage = e => onResult(w, e.data);
      w.onerror = e => { console.error(e); showMsg(`<b>The card reader stopped.</b><p>Close this and try again, or take a photo.</p><button class="lbtn primary" data-l="photo">Take a photo instead</button>`); };
      workers.push(w); idle.push(w);
    }
    keepAwake();
    schedule();
  }

  async function keepAwake() {
    if (closed || document.visibilityState !== "visible") return;
    if (!("wakeLock" in navigator)) { hint("This phone may dim the screen during the scan."); return; }
    try { wakeLock = await navigator.wakeLock.request("screen"); }
    catch { hint("The phone wouldn't keep the screen on. Tap the screen now and then."); }
  }
  const onVisible = () => { if (document.visibilityState === "visible" && stream) { keepAwake(); schedule(); } };
  document.addEventListener("visibilitychange", onVisible);

  // Android's back button closes the scan and keeps what was read.
  history.pushState({ live: true }, "");
  const onPop = () => finish(true, false);
  window.addEventListener("popstate", onPop);

  function finish(keep, popHistory = true) {
    if (closed) return;
    closed = true;
    window.removeEventListener("popstate", onPop);
    document.removeEventListener("visibilitychange", onVisible);
    stream?.getTracks().forEach(t => t.stop());
    workers.forEach(w => w.terminate());
    wakeLock?.release().catch(() => {});
    el.remove(); document.body.classList.remove("living");
    if (popHistory && history.state?.live) history.back();
    if (keep) opts.onDone({ reads: [...deb.committed].map(([card, letter]) => ({ card, letter })), tilted: [...everTilted] });
    else opts.onCancel?.();
  }

  el.addEventListener("click", e => {
    const b = e.target.closest("[data-l]"); if (!b) return;
    const panel = $(".lsettings"), conf = $(".lconfirm");
    switch (b.dataset.l) {
      case "done": finish(true); break;
      case "cancel":
        if (!deb.committed.size) { finish(false); break; }
        conf.innerHTML = `<p>Close without saving ${deb.committed.size} ${deb.committed.size === 1 ? "card" : "cards"} read this time?</p><div class="lrow"><button class="lbtn danger" data-l="discard">Close, don't save</button><button class="lbtn primary" data-l="keepgoing">Keep scanning</button></div>`;
        conf.hidden = false; break;
      case "discard": finish(false); break;
      case "keepgoing": conf.hidden = true; break;
      case "settings": panel.hidden = !panel.hidden; b.setAttribute("aria-expanded", String(!panel.hidden)); break;
      case "missing": drawerOpen = !drawerOpen; paint(); break;
      case "retry": start(); break;
      case "photo": finish(false); opts.onPhoto?.(); break;
    }
  });
  el.addEventListener("change", e => {
    const k = e.target.dataset.s; if (!k) return;
    settings[k] = e.target.checked; opts.saveSettings?.(settings);
    $(".ldebug").hidden = !settings.debug; paint(); drawOverlay();
  });

  paint();
  start();
  return { close: finish };
}
