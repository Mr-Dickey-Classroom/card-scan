import { describe, it, expect } from "vitest";
import CODES from "../../reference/card-codes.json";
import { AR } from "../../src/vendor/js-aruco2.js";
import { angleToLetter, readAngle, getDetector, addReads, MAX_CARDS } from "../../src/detect.js";

describe("card codes", () => {
  it("has the 40 printed codes, in order", () => {
    expect(CODES).toHaveLength(40);
    expect(CODES[0]).toBe(22631);
    expect(CODES[39]).toBe(19335);
  });
  it("loads the bundled js-aruco2 detector with the STCS dictionary", () => {
    expect(typeof AR.Detector).toBe("function");
    getDetector();
    expect(AR.DICTIONARIES.STCS_CARDS).toEqual({ nBits: 16, tau: 2, codeList: CODES });
  });
});

describe("letter on top", () => {
  it("maps quarter turns to A, D, C, B", () => {
    expect(angleToLetter(0)).toBe("A");
    expect(angleToLetter(90)).toBe("D");
    expect(angleToLetter(180)).toBe("C");
    expect(angleToLetter(-180)).toBe("C");
    expect(angleToLetter(-90)).toBe("B");
  });
  it("accepts up to 32° of tilt and refuses beyond it", () => {
    expect(angleToLetter(32)).toBe("A");
    expect(angleToLetter(-31)).toBe("A");
    expect(angleToLetter(33)).toBeNull();
    expect(angleToLetter(45)).toBeNull();
    expect(angleToLetter(90 + 40)).toBeNull();
  });
  it("shifts by quarter turns for sideways photos", () => {
    expect(angleToLetter(0, 1)).toBe("D");
    expect(angleToLetter(0, 2)).toBe("C");
    expect(angleToLetter(0, 3)).toBe("B");
    expect(angleToLetter(90, 3)).toBe("A");
  });
  it("swaps B and D for a mirrored (front) camera", () => {
    expect(angleToLetter(-90, 0, true)).toBe("D");
    expect(angleToLetter(90, 0, true)).toBe("B");
    expect(angleToLetter(0, 0, true)).toBe("A");
  });
  it("reads the angle of the A edge (y points down)", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(readAngle(sq)).toBeCloseTo(0);
    const right = [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
    expect(readAngle(right)).toBeCloseTo(90);
  });
});

describe("best read per card", () => {
  const sq = (s, off = 0) => [{ x: off, y: 0 }, { x: off + s, y: 0 }, { x: off + s, y: s }, { x: off, y: s }];
  it("rejects ids ≥ 40", () => {
    const best = addReads({}, [{ id: MAX_CARDS, corners: sq(80), hammingDistance: 0 }], 1);
    expect(Object.keys(best)).toHaveLength(0);
  });
  it("prefers lower Hamming distance, then side nearest 80 px, and rescales corners", () => {
    const best = {};
    addReads(best, [{ id: 3, corners: sq(80), hammingDistance: 1 }], 1);
    addReads(best, [{ id: 3, corners: sq(300), hammingDistance: 0 }], 1);
    expect(best[3].corners[1].x).toBe(300);
    addReads(best, [{ id: 3, corners: sq(75), hammingDistance: 0 }], 0.25);
    expect(best[3].card).toBe(4);
    expect(best[3].corners[1].x).toBe(300); // 75 / 0.25
  });
});
