import { describe, expect, it } from "vitest";
import {
  boxOf,
  conflicts,
  digitCounts,
  formatElapsed,
  isGiven,
  isSolved,
  mistakes,
  parseGrid,
  peersOf,
  serializeGrid,
} from "./sudoku";

const SOLVED =
  "534678912" +
  "672195348" +
  "198342567" +
  "859761423" +
  "426853791" +
  "713924856" +
  "961537284" +
  "287419635" +
  "345286179";

const PUZZLE =
  "530070000" +
  "600195000" +
  "098000060" +
  "800060003" +
  "400803001" +
  "700020006" +
  "060000280" +
  "000419005" +
  "000080079";

describe("grid parsing", () => {
  it("round-trips an 81-char board", () => {
    expect(serializeGrid(parseGrid(PUZZLE))).toBe(PUZZLE);
  });

  it("maps '0' to an empty cell", () => {
    expect(parseGrid(PUZZLE)[2]).toBe(0);
    expect(parseGrid(PUZZLE)[0]).toBe(5);
  });

  it("rejects a board of the wrong length", () => {
    expect(() => parseGrid("123")).toThrow();
  });
});

describe("givens", () => {
  it("treats a filled cell in the deal as a given", () => {
    expect(isGiven(PUZZLE, 0)).toBe(true);
    expect(isGiven(PUZZLE, 2)).toBe(false);
  });
});

describe("geometry", () => {
  it("puts the first three columns of the first three rows in box 0", () => {
    expect(boxOf(0)).toBe(0);
    expect(boxOf(20)).toBe(0);
    expect(boxOf(3)).toBe(1);
    expect(boxOf(80)).toBe(8);
  });

  it("gives every cell exactly 20 peers", () => {
    for (let i = 0; i < 81; i++) expect(peersOf(i)).toHaveLength(20);
  });
});

describe("conflicts", () => {
  it("finds none in a solved grid", () => {
    expect(conflicts(parseGrid(SOLVED)).size).toBe(0);
  });

  it("flags both cells of a duplicate in a row", () => {
    const grid = parseGrid(PUZZLE);
    grid[2] = 5; // row 0 already holds a 5 at index 0
    const bad = conflicts(grid);
    expect(bad.has(0)).toBe(true);
    expect(bad.has(2)).toBe(true);
  });

  it("ignores empty cells", () => {
    expect(conflicts(parseGrid(PUZZLE)).size).toBe(0);
  });
});

describe("mistakes", () => {
  it("flags a digit that breaks no rule but disagrees with the solution", () => {
    const grid = parseGrid(PUZZLE);
    // Cell 2's peers already hold 3,5,6,7,8,9 — so 1, 2 and 4 are all rule-legal there, and
    // only 4 is correct. This is the case conflict-checking alone cannot catch.
    grid[2] = 2;
    expect(conflicts(grid).has(2)).toBe(false);
    expect(mistakes(grid, SOLVED).has(2)).toBe(true);
  });
});

describe("isSolved", () => {
  it("is true only when the grid equals the solution", () => {
    expect(isSolved(parseGrid(SOLVED), SOLVED)).toBe(true);
    expect(isSolved(parseGrid(PUZZLE), SOLVED)).toBe(false);
  });
});

describe("digitCounts", () => {
  it("counts nine of each digit in a solved grid", () => {
    const counts = digitCounts(parseGrid(SOLVED));
    for (let d = 1; d <= 9; d++) expect(counts[d]).toBe(9);
  });
});

describe("formatElapsed", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(64)).toBe("1:04");
  });

  it("formats over an hour as h:mm:ss", () => {
    expect(formatElapsed(3725)).toBe("1:02:05");
  });
});
