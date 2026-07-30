import { describe, expect, it } from "vitest";
import type {
  BoardResponse,
  BoardStatsResponse,
  Difficulty,
  DifficultyBreakdown,
} from "../api/types";
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
  matchId: null,
  notes: {},
  elapsedSeconds,
  claimedAt: "2026-07-12T00:00:00Z",
  completedAt: status === "completed" ? "2026-07-12T00:10:00Z" : null,
  lastModifiedAt: "2026-07-12T00:10:00Z",
});

const tier = (breakdown: Partial<DifficultyBreakdown> = {}): DifficultyBreakdown => ({
  boardsSolved: 0,
  boardsInProgress: 0,
  bestTime: null,
  totalPlayTime: 0,
  ...breakdown,
});

/**
 * The wire shape of `GET /board/stats`. A tier's `totalPlayTime` covers its *solved* boards only,
 * while the top-level one counts unfinished boards too — the fixtures keep that asymmetry.
 */
const makeStats = (
  stats: Partial<Omit<BoardStatsResponse, "statsByDifficulty">> & {
    statsByDifficulty?: Partial<Record<Difficulty, DifficultyBreakdown>>;
  } = {},
): BoardStatsResponse => ({
  boardsSolved: 0,
  bestCompletedTime: null,
  totalPlayTime: 0,
  ...stats,
  statsByDifficulty: {
    easy: tier(),
    moderate: tier(),
    hard: tier(),
    ...stats.statsByDifficulty,
  },
});

describe("computeStats", () => {
  it("returns zeroes for a player with no boards", () => {
    const stats = computeStats(makeStats());
    expect(stats.solved).toBe(0);
    expect(stats.inProgress).toBe(0);
    expect(stats.totalSeconds).toBe(0);
    expect(stats.bestSeconds).toBeNull();
    expect(stats.byDifficulty).toHaveLength(3);
  });

  it("takes the solved count and the total from the server, and sums in-progress per tier", () => {
    const stats = computeStats(
      makeStats({
        boardsSolved: 2,
        totalPlayTime: 1050,
        statsByDifficulty: {
          easy: tier({ boardsSolved: 1, boardsInProgress: 1, bestTime: 100, totalPlayTime: 100 }),
          hard: tier({ boardsSolved: 1, bestTime: 900, totalPlayTime: 900 }),
        },
      }),
    );

    expect(stats.solved).toBe(2);
    expect(stats.inProgress).toBe(1);
    // 1050, not 1000: the server counts the unfinished board's 50 seconds. It was still time spent.
    expect(stats.totalSeconds).toBe(1050);
  });

  it("passes the overall best solve through", () => {
    const stats = computeStats(makeStats({ boardsSolved: 2, bestCompletedTime: 120 }));
    expect(stats.bestSeconds).toBe(120);
  });

  it("has no best time until a board is solved", () => {
    const stats = computeStats(
      makeStats({ totalPlayTime: 5, statsByDifficulty: { easy: tier({ boardsInProgress: 1 }) } }),
    );
    expect(stats.bestSeconds).toBeNull();
  });

  it("breaks best and average down per difficulty", () => {
    const stats = computeStats(
      makeStats({
        boardsSolved: 3,
        bestCompletedTime: 60,
        totalPlayTime: 10359,
        statsByDifficulty: {
          easy: tier({ boardsSolved: 1, bestTime: 60, totalPlayTime: 60 }),
          moderate: tier({
            boardsSolved: 2,
            boardsInProgress: 1,
            bestTime: 100,
            totalPlayTime: 300,
          }),
        },
      }),
    );

    const moderate = stats.byDifficulty.find((d) => d.difficulty === "moderate")!;
    expect(moderate.solved).toBe(2);
    expect(moderate.inProgress).toBe(1);
    expect(moderate.bestSeconds).toBe(100);
    // The unfinished board's 9999 seconds are in the overall total but not in this average.
    expect(moderate.averageSeconds).toBe(150);

    const hard = stats.byDifficulty.find((d) => d.difficulty === "hard")!;
    expect(hard.solved).toBe(0);
    expect(hard.bestSeconds).toBeNull();
    expect(hard.averageSeconds).toBeNull();
  });

  it("rounds an average that does not divide evenly", () => {
    const stats = computeStats(
      makeStats({
        boardsSolved: 3,
        statsByDifficulty: { easy: tier({ boardsSolved: 3, bestTime: 30, totalPlayTime: 100 }) },
      }),
    );
    expect(stats.byDifficulty.find((d) => d.difficulty === "easy")!.averageSeconds).toBe(33);
  });

  // Dividing play time by a solved count of zero would put NaN on the page — the table only
  // renders an em dash for null.
  it("reports no average for a tier that has been played but never solved", () => {
    const stats = computeStats(
      makeStats({ statsByDifficulty: { hard: tier({ boardsInProgress: 2 }) } }),
    );
    expect(stats.byDifficulty.find((d) => d.difficulty === "hard")!.averageSeconds).toBeNull();
  });

  // The endpoint's contract documents unplayed tiers as absent rows, even though it currently
  // fills them in with zeroes. Either way the page has to render three rows.
  it("treats a tier missing from the response as unplayed", () => {
    const stats = computeStats({
      boardsSolved: 1,
      bestCompletedTime: 60,
      totalPlayTime: 60,
      statsByDifficulty: {
        easy: tier({ boardsSolved: 1, bestTime: 60, totalPlayTime: 60 }),
      } as BoardStatsResponse["statsByDifficulty"],
    });

    const hard = stats.byDifficulty.find((d) => d.difficulty === "hard")!;
    expect(hard.solved).toBe(0);
    expect(hard.inProgress).toBe(0);
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
