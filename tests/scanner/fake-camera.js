// A fake rear camera for the live scan tests: the page's getUserMedia returns a canvas stream of a
// synthetic desk with cards on it (about 10 ft away at 1080p), drawn fresh every frame with a little noise.
// Runs in the page before the app loads. cards: { cardNumber: { letter, tilt } }.
// max4k: the camera says it can do 3840×2160, and asking for it gives a 4K stream (the "Far" setting).
export function fakeCamera({ codes, cards, max4k = false }) {
  window.__fake = { cards, frames: 0, asked: [] };
  const quarter = { A: 0, D: 1, C: 2, B: 3 }; // canvas +90° puts the A edge on the right, so D is on top
  function makeStream(W, H) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), z = W / 1920;
    function marker(id, s) {
      const bits = codes[id].toString(2).padStart(16, "0"), u = s / 6;
      ctx.fillStyle = "#000"; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.fillStyle = "#fff";
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (bits[i * 4 + j] === "1") ctx.fillRect(-s / 2 + (j + 1) * u, -s / 2 + (i + 1) * u, u + 0.5, u + 0.5);
    }
    function draw() {
      window.__fake.frames++;
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#7d8270"); g.addColorStop(1, "#3d4038");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#6b4f33"; ctx.fillRect(0, 620 * z, W, 460 * z); // the desk
      Object.entries(window.__fake.cards).forEach(([n, c], i) => {
        const s = 72 * z, x = (330 + i * 300 + Math.sin(window.__fake.frames / 3) * 2) * z, y = (540 + (i % 2) * 90) * z;
        ctx.save(); ctx.translate(x, y); ctx.rotate(((quarter[c.letter] * 90) + (c.tilt || 0)) * Math.PI / 180);
        ctx.fillStyle = "#f4f2ec"; ctx.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
        marker(+n - 1, s); ctx.restore();
      });
      for (let k = 0; k < 400; k++) { ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},0,0,0.06)`; ctx.fillRect(Math.random() * W, Math.random() * H, 3 * z, 3 * z); }
    }
    draw(); const timer = setInterval(draw, 66);
    const stream = cv.captureStream(15), track = stream.getVideoTracks()[0];
    track.getCapabilities = () => ({ width: { max: max4k ? 3840 : 1920 }, height: { max: max4k ? 2160 : 1080 } });
    track.getSettings = () => ({ width: W, height: H, facingMode: "environment" });
    const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); };
    return stream;
  }
  navigator.mediaDevices.getUserMedia = async ({ video } = {}) => {
    const want = video?.width?.ideal || 1920;
    window.__fake.asked.push(want);
    return want >= 3840 && max4k ? makeStream(3840, 2160) : makeStream(1920, 1080);
  };
}
