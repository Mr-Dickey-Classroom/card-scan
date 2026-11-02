// Live-scan debounce (BUILD_BRIEF section 5): an answer counts only after the same card shows the
// same letter in `need` consecutive frames. A card that later shows a different letter steadily for
// `need` frames is updated. A tilted card (letter null) never records or erases an answer.
// Pure logic, no browser APIs, so it can be unit tested.

// reads: [{ card, letter }] from one frame; letter is "A"–"D" or null (tilted).
// Returns { changes: [{ card, letter, prev }], tilted: [card] } for this frame.
export function createDebouncer(need = 2) {
  const streak = new Map();    // card → { letter, n } run of identical reads, broken by a miss
  const committed = new Map(); // card → letter recorded

  function feed(reads) {
    const seen = new Map();
    for (const r of reads) seen.set(r.card, r.letter ?? null);
    for (const card of [...streak.keys()]) if (!seen.has(card)) streak.delete(card);

    const changes = [], tilted = [];
    for (const [card, letter] of seen) {
      if (letter === null) { streak.delete(card); tilted.push(card); continue; }
      const s = streak.get(card);
      const n = s && s.letter === letter ? s.n + 1 : 1;
      streak.set(card, { letter, n });
      const prev = committed.get(card) ?? null;
      if (n >= need && prev !== letter) {
        committed.set(card, letter);
        changes.push({ card, letter, prev });
      }
    }
    return { changes, tilted };
  }

  return { feed, committed, reset() { streak.clear(); committed.clear(); } };
}
