// Live scanning runs card detection here, off the main thread, so the camera preview stays smooth.
// Gets { img: ImageData, seq, mirrored } and answers { seq, items: [{ card, corners, letter }], ms }.
import { detectImageData, angleToLetter } from "./detect.js";

self.onmessage = e => {
  const { img, seq, mirrored } = e.data, t0 = performance.now();
  try {
    const items = detectImageData(img).map(m => ({ card: m.card, corners: m.corners, letter: angleToLetter(m.angle, 0, mirrored) }));
    self.postMessage({ seq, items, ms: performance.now() - t0, w: img.width, h: img.height });
  } catch (err) {
    self.postMessage({ seq, items: [], error: String(err?.message || err), w: img.width, h: img.height });
  }
};
