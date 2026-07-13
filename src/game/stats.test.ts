import { describe, expect, it } from "vitest";
import type { BoardResponse, Difficulty } from "../api/types";
import { computeStats, progressOf, relativeTime } from "./stats";

const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const PUZZLE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

let nextId = 1;

const makeBoard = (
  difficulty: Difficulty,
  status: "in_progress" | "completed",
  elapsedSeconds: number,
  currentState = PUZZLE,
): BoardResponse => ({
  id: nextId++,
  difficulty,
  status,
  puzzle: PUZZLE,
  currentState: status === "completed" ? SOLUTION : currentState,
  solution: SOLUTION,
  notes: {},
  elapsedSeconds,
  claimedAt: "2026-07-12T00:00:00Z",
  completedAt: status === "completed" ? "2026-07-12T00:10:00Z" : null,
  lastModifiedAt: "2026-07-12T00:10:00Z",
});

describe("computeStats", () => {
  it("returns zeroes for a player with no boards", () => {
    const stats = computeStats([]);
    expect(stats.solved).toBe(0);
    expect(stats.inProgress).toBe(0);
    expect(stats.totalSeconds).toBe(0);
    expect(stats.bestSeconds).toBeNull();
    expect(stats.byDifficulty).toHaveLength(3);
  });

  it("counts solved and in-progress boards", () => {
    const stats = computeStats([
      makeBoard("easy", "completed", 100),
      makeBoard("easy", "in_progress", 50),
      makeBoard("hard", "completed", 900),
    ]);
    expect(stats.solved).toBe(2);
    expect(stats.inProgress).toBe(1);
  });

  it("counts time from unfinished boards too — it was still time spent", () => {
    const stats = computeStats([
      makeBoard("easy", "completed", 100),
      makeBoard("easy", "in_progress", 50),
    ]);
    expect(stats.totalSeconds).toBe(150);
  });

  // A best time may only come from a board that was actually solved. An abandoned board sitting
  // at 5 seconds is not a 5-second solve.
  it("takes the best time only from solved boards", () => {
    const stats = computeStats([
      makeBoard("easy", "completed", 300),
      makeBoard("easy", "in_progress", 5),
    ]);
    expect(stats.bestSeconds).toBe(300);
  });

  it("finds the best across every difficulty", () => {
    const stats = computeStats([
      makeBoard("easy", "completed", 300),
      makeBoard("hard", "completed", 120),
    ]);
    expect(stats.bestSeconds).toBe(120);
  });

  it("breaks best and average down per difficulty", () => {
    const stats = computeStats([
      makeBoard("moderate", "completed", 100),
      makeBoard("moderate", "completed", 200),
      makeBoard("moderate", "in_progress", 9999),
      makeBoard("easy", "completed", 60),
    ]);

    const moderate = stats.byDifficulty.find((d) => d.difficulty === "moderate")!;
    expect(moderate.solved).toBe(2);
    expect(moderate.inProgress).toBe(1);
    expect(moderate.bestSeconds).toBe(100);
    expect(moderate.averageSeconds).toBe(150);

    const hard = stats.byDifficulty.find((d) => d.difficulty === "hard")!;
    expect(hard.solved).toBe(0);
    expect(hard.bestSeconds).toBeNull();
    expect(hard.averageSeconds).toBeNull();
  });
});

describe("progressOf", () => {
  it("is 0 on a fresh board — givens are not the player's work", () => {
    expect(progressOf(makeBoard("easy", "in_progress", 0))).toBe(0);
  });

  it("is 1 on a solved board", () => {
    expect(progressOf(makeBoard("easy", "completed", 100))).toBe(1);
  });

  it("counts only the cells the player has to fill", () => {
    const toFill = [...PUZZLE].filter((c) => c === "0").length;
    // Fill exactly one empty cell.
    const firstEmpty = PUZZLE.indexOf("0");
    const partial =
      PUZZLE.slice(0, firstEmpty) + SOLUTION[firstEmpty] + PUZZLE.slice(firstEmpty + 1);

    expect(progressOf(makeBoard("easy", "in_progress", 0, partial))).toBeCloseTo(1 / toFill);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-07-12T12:00:00Z");

  it("says just now for the last few seconds", () => {
    expect(relativeTime("2026-07-12T11:59:50Z", now)).toBe("just now");
  });

  it("reports minutes, hours and days", () => {
    expect(relativeTime("2026-07-12T11:30:00Z", now)).toMatch(/30 minutes ago/);
    expect(relativeTime("2026-07-12T09:00:00Z", now)).toMatch(/3 hours ago/);
    expect(relativeTime("2026-07-10T12:00:00Z", now)).toMatch(/2 days ago/);
  });
});
