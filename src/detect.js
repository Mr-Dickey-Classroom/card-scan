// Card detection. Tested rules from BUILD_BRIEF section 5 — do not change the codes, the
// dictionary settings, or the angle → letter mapping. 40 cards are already printed.
import { AR } from "./vendor/js-aruco2.js";
import CODES from "../reference/card-codes.json";

export const MAX_CARDS = 40;
export const TILT_LIMIT = 32; // degrees from the nearest quarter turn before we refuse to guess

let detector = null;
export function getDetector() {
  if (!detector) {
    AR.DICTIONARIES.STCS_CARDS = { nBits: 16, tau: 2, codeList: CODES };
    detector = new AR.Detector({ dictionaryName: "STCS_CARDS", maxHammingDistance: 2 });
  }
  return detector;
}

// Which letter is on top: angle of the card's A edge (corner 0 → corner 1), measured from straight up.
export function readAngle(c) {
  const cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4, cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
  const mx = (c[0].x + c[1].x) / 2 - cx, my = (c[0].y + c[1].y) / 2 - cy;
  return Math.atan2(mx, -my) * 180 / Math.PI;
}

// Returns "A"–"D", or null when the card is tilted too far to call.
// `turn` shifts by quarter turns ("Photo was sideways?"). `mirrored` is for a front camera (B↔D).
export function angleToLetter(ang, turn = 0, mirrored = false) {
  const k = Math.round(ang / 90), dev = Math.abs(ang - k * 90);
  if (dev > TILT_LIMIT) return null;
  const L = ["A", "D", "C", "B"][(((k + turn) % 4) + 4) % 4];
  return mirrored ? ({ B: "D", D: "B" }[L] || L) : L;
}

// Keep the best read per card: lowest Hamming distance, then side length closest to 80 px.
export function addReads(best, markers, f) {
  for (const m of markers) {
    if (m.id < 0 || m.id >= MAX_CARDS) continue;
    const side = Math.hypot(m.corners[0].x - m.corners[1].x, m.corners[0].y - m.corners[1].y);
    const score = m.hammingDistance * 100 + Math.abs(Math.log(side / 80));
    if (!best[m.id] || score < best[m.id].score)
      best[m.id] = { score, card: m.id + 1, corners: m.corners.map(p => ({ x: p.x / f, y: p.y / f })) };
  }
  return best;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// Detect at 1×, ½× and ¼× (skipping any scale under 300 px) so big close-up cards aren't missed.
// `source` is a canvas, OffscreenCanvas or ImageBitmap. Returns [{ card, corners, angle }].
export function detectMulti(source) {
  const det = getDetector(), W = source.width, H = source.height, best = {};
  for (const f of [1, 0.5, 0.25]) {
    const w = Math.round(W * f), h = Math.round(H * f);
    if (Math.min(w, h) < 300) break;
    const c = makeCanvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(source, 0, 0, w, h);
    addReads(best, det.detect(x.getImageData(0, 0, w, h)), f);
  }
  return Object.values(best).map(m => ({ card: m.card, corners: m.corners, angle: readAngle(m.corners) }));
}

// Decode a photo with the phone's rotation applied, capped at 4200 px on the longest side.
export async function fileToCanvas(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    src = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("That file isn't a photo this page can read."));
      im.src = URL.createObjectURL(file);
    });
  }
  const w0 = src.width, h0 = src.height, k = Math.min(1, 4200 / Math.max(w0, h0));
  const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext("2d", { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
  return c;
}
