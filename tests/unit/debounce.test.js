import { describe, it, expect } from "vitest";
import { createDebouncer } from "../../src/debounce.js";

const r = (card, letter) => ({ card, letter });

describe("live-scan debounce: 2 matching frames in a row", () => {
  it("records an answer only on the second matching frame", () => {
    const d = createDebouncer(2);
    expect(d.feed([r(3, "B")]).changes).toEqual([]);
    expect(d.feed([r(3, "B")]).changes).toEqual([{ card: 3, letter: "B", prev: null }]);
    expect(d.committed.get(3)).toBe("B");
  });

  it("reports each answer once, not on every frame after", () => {
    const d = createDebouncer(2);
    d.feed([r(3, "B")]); d.feed([r(3, "B")]);
    expect(d.feed([r(3, "B")]).changes).toEqual([]);
    expect(d.feed([r(3, "B")]).changes).toEqual([]);
  });

  it("a frame where the card is missing breaks the run", () => {
    const d = createDebouncer(2);
    d.feed([r(3, "B")]); d.feed([]);
    expect(d.feed([r(3, "B")]).changes).toEqual([]);
    expect(d.feed([r(3, "B")]).changes).toHaveLength(1);
  });

  it("flickering letters never record", () => {
    const d = createDebouncer(2);
    for (const L of ["A", "B", "A", "B", "A"]) expect(d.feed([r(5, L)]).changes).toEqual([]);
    expect(d.committed.has(5)).toBe(false);
  });

  it("a student who changes their mind is updated after 2 steady frames", () => {
    const d = createDebouncer(2);
    d.feed([r(7, "A")]); d.feed([r(7, "A")]);
    expect(d.feed([r(7, "C")]).changes).toEqual([]);
    expect(d.committed.get(7)).toBe("A");
    expect(d.feed([r(7, "C")]).changes).toEqual([{ card: 7, letter: "C", prev: "A" }]);
  });

  it("one stray frame with another letter doesn't change a recorded answer", () => {
    const d = createDebouncer(2);
    d.feed([r(7, "A")]); d.feed([r(7, "A")]);
    d.feed([r(7, "D")]);
    expect(d.feed([r(7, "A")]).changes).toEqual([]);
    expect(d.committed.get(7)).toBe("A");
  });

  it("tilted cards (no letter) never record or erase, and are listed", () => {
    const d = createDebouncer(2);
    expect(d.feed([r(9, null)])).toEqual({ changes: [], tilted: [9] });
    expect(d.feed([r(9, null)]).changes).toEqual([]);
    expect(d.committed.has(9)).toBe(false);
    d.feed([r(9, "B")]); d.feed([r(9, "B")]);
    d.feed([r(9, null)]); d.feed([r(9, null)]);
    expect(d.committed.get(9)).toBe("B");
  });

  it("a tilted frame breaks the run", () => {
    const d = createDebouncer(2);
    d.feed([r(9, "B")]); d.feed([r(9, null)]);
    expect(d.feed([r(9, "B")]).changes).toEqual([]);
  });

  it("tracks many cards at once, each on its own", () => {
    const d = createDebouncer(2);
    d.feed([r(1, "A"), r(2, "B"), r(3, "C")]);
    const { changes } = d.feed([r(1, "A"), r(2, "D"), r(3, "C"), r(4, "A")]);
    expect(changes.map(c => c.card).sort()).toEqual([1, 3]);
    expect(d.feed([r(2, "D"), r(4, "A")]).changes.map(c => c.card).sort()).toEqual([2, 4]);
  });

  it("reset forgets everything", () => {
    const d = createDebouncer(2);
    d.feed([r(1, "A")]); d.feed([r(1, "A")]);
    d.reset();
    expect(d.committed.size).toBe(0);
    expect(d.feed([r(1, "A")]).changes).toEqual([]);
  });
});
