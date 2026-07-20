import { describe, expect, it } from "vitest";
import type { BoardResponse } from "../api/types";
import { gameReducer, initialState, looksSolved, type GameState } from "./gameReducer";

const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

const PUZZLE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

/** A board dealt for a race: the server withholds the solution until this player finishes. */
const matchBoard: BoardResponse = {
  id: 7,
  difficulty: "easy",
  status: "in_progress",
  puzzle: PUZZLE,
  currentState: PUZZLE,
  solution: null,
  matchId: 99,
  notes: {},
  elapsedSeconds: 0,
  claimedAt: "2026-07-19T00:00:00Z",
  completedAt: null,
  lastModifiedAt: "2026-07-19T00:00:00Z",
};

const soloBoard: BoardResponse = { ...matchBoard, solution: SOLUTION, matchId: null };

/** Fills every empty cell with `digit`, giving a full grid that is almost certainly wrong. */
const fillAll = (state: GameState, digit: number): GameState =>
  state.grid.reduce(
    (acc, value, i) =>
      value === 0
        ? gameReducer(gameReducer(acc, { type: "SELECT", index: i }), {
            type: "INPUT_DIGIT",
            digit,
          })
        : acc,
    state,
  );

describe("a board with no solution", () => {
  it("carries the match id and a null solution into game state", () => {
    const state = initialState(matchBoard);

    expect(state.solution).toBeNull();
    expect(state.matchId).toBe(99);
  });

  it("cannot be hinted — there is nothing on the client to reveal", () => {
    const state = gameReducer(initialState(matchBoard), { type: "HINT" });

    expect(state.grid).toEqual(initialState(matchBoard).grid);
    expect(state.hintsUsed).toBe(0);
  });

  it("cannot be checked — live error marking is not part of a race", () => {
    const state = gameReducer(initialState(matchBoard), { type: "CHECK" });

    expect(state.checking).toBe(false);
  });

  it("still allows hints and checks when the solution is present", () => {
    const hinted = gameReducer(initialState(soloBoard), { type: "HINT" });
    const checked = gameReducer(initialState(soloBoard), { type: "CHECK" });

    expect(hinted.hintsUsed).toBe(1);
    expect(checked.checking).toBe(true);
  });
});

describe("a hint the server computed", () => {
  it("fills the cell and counts as a hint", () => {
    const state = gameReducer(initialState(matchBoard), {
      type: "REVEALED",
      index: 2,
      digit: 4,
    });

    expect(state.grid[2]).toBe(4);
    expect(state.hintsUsed).toBe(1);
  });

  it("is undoable, like any other edit", () => {
    const revealed = gameReducer(initialState(matchBoard), {
      type: "REVEALED",
      index: 2,
      digit: 4,
    });
    const undone = gameReducer(revealed, { type: "UNDO" });

    expect(undone.grid[2]).toBe(0);
  });

  it("marks the board unsaved so the reveal is echoed back on the next save", () => {
    const before = initialState(matchBoard);
    const after = gameReducer(before, { type: "REVEALED", index: 2, digit: 4 });

    expect(after.revision).toBeGreaterThan(before.revision);
  });

  it("is refused on a completed board", () => {
    const frozen = { ...initialState(matchBoard), status: "completed" as const };
    const state = gameReducer(frozen, { type: "REVEALED", index: 2, digit: 4 });

    expect(state.grid[2]).toBe(0);
    expect(state.hintsUsed).toBe(0);
  });
});

describe("predicting completion without a solution", () => {
  it("treats a full grid as worth saving, even when it is wrong", () => {
    // The client cannot tell right from wrong here, and a full grid is the only moment completion
    // is possible — so it flushes and lets the server rule.
    const full = fillAll(initialState(matchBoard), 1);

    expect(full.grid.every((d) => d !== 0)).toBe(true);
    expect(looksSolved(full)).toBe(true);
  });

  it("does not fire while cells are still empty", () => {
    expect(looksSolved(initialState(matchBoard))).toBe(false);
  });

  it("stays exact when the solution is present", () => {
    const wrongButFull = fillAll(initialState(soloBoard), 1);

    expect(looksSolved(wrongButFull)).toBe(false);
  });
});
