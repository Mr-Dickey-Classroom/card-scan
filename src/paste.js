// Paste parser for bell work questions: numbered questions with a "CORRECT: X" line under each
// (like the Plickers text file), or just the letters, like "B A C A".
export function parsePaste(txt) {
  const lines = String(txt).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = []; let cur = null;
  for (const l of lines) {
    const q = l.match(/^(\d+)[.)]\s+(.*)$/), c = l.match(/^correct\s*[:=]?\s*([ABCD])\b/i);
    if (q) { cur = { text: q[2].trim(), correct: "" }; out.push(cur); }
    else if (c && cur) cur.correct = c[1].toUpperCase();
  }
  if (out.length) return out;
  const letters = String(txt).toUpperCase().match(/\b[ABCD]\b/g);
  return letters ? letters.map(L => ({ text: "", correct: L })) : [];
}
