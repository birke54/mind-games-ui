import { beforeEach, describe, expect, it } from "vitest";
import type { BoardResponse } from "../api/types";
import { clearMirror, readMirror, reconcile, writeMirror } from "./boardMirror";
import { gameReducer, initialState, type GameAction, type GameState } from "./gameReducer";

const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const PUZZLE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

const board: BoardResponse = {
  id: 7,
  difficulty: "easy",
  status: "in_progress",
  puzzle: PUZZLE,
  currentState: PUZZLE,
  solution: SOLUTION,
  matchId: null,
  notes: {},
  elapsedSeconds: 0,
  claimedAt: "2026-07-12T00:00:00Z",
  completedAt: null,
  lastModifiedAt: "2026-07-12T00:00:00Z",
};

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);

/** A state with one unsaved digit in cell 2. */
const withUnsavedEdit = () =>
  run(initialState(board), { type: "SELECT", index: 2 }, { type: "INPUT_DIGIT", digit: 4 });

beforeEach(() => {
  localStorage.clear();
});

describe("the mirror", () => {
  it("round-trips the player's work", () => {
    writeMirror(withUnsavedEdit(), board);

    const mirror = readMirror(7)!;
    expect(mirror.currentState[2]).toBe("4");
    // The whole board is stored, not just the moves — the game must be reconstructable with no
    // network, where GET /boards cannot answer.
    expect(mirror.board.puzzle).toBe(PUZZLE);
    expect(mirror.board.solution).toBe(SOLUTION);
    expect(mirror.board.lastModifiedAt).toBe(board.lastModifiedAt);
  });

  it("returns nothing for a board it has never seen", () => {
    expect(readMirror(999)).toBeNull();
  });

  it("survives garbage in localStorage rather than throwing", () => {
    localStorage.setItem("mind-games:board:7", "{ not json");
    expect(readMirror(7)).toBeNull();
  });

  it("can be cleared", () => {
    writeMirror(withUnsavedEdit(), board);
    clearMirror(7);
    expect(readMirror(7)).toBeNull();
  });
});

describe("reconcile", () => {
  it("takes the server's board when there is nothing local", () => {
    const result = reconcile(board, null);
    expect(result.kind).toBe("server");
    expect(result.state.grid[2]).toBe(0);
  });

  // The mirror is the server's state plus edits this device made and never got to upload — we
  // went offline, or the tab died inside the debounce. That is this device's own work coming
  // back, not a conflict.
  it("restores unsaved local work when the server has not moved", () => {
    writeMirror(withUnsavedEdit(), board);

    const result = reconcile(board, readMirror(7));
    expect(result.kind).toBe("local");
    expect(result.state.grid[2]).toBe(4);
  });

  it("keeps the local elapsed time too", () => {
    writeMirror(run(withUnsavedEdit(), { type: "TICK" }, { type: "TICK" }), board);

    const result = reconcile(board, readMirror(7));
    expect(result.state.elapsedSeconds).toBe(2);
  });

  // A mirror with nothing unsaved in it is just a stale copy of the server's own board. The
  // server's version wins; there is nothing to preserve.
  it("prefers the server when the mirror holds no unsaved edits", () => {
    const saved = gameReducer(withUnsavedEdit(), {
      type: "SAVED",
      revision: 1,
      elapsedSeconds: 0,
      status: "in_progress",
      completedAt: null,
    });
    writeMirror(saved, { ...board, lastModifiedAt: "2026-07-12T00:05:00Z" });

    const moved: BoardResponse = { ...board, lastModifiedAt: "2026-07-12T00:09:00Z" };
    expect(reconcile(moved, readMirror(7)).kind).toBe("server");
  });

  /**
   * THE data-loss case. Saving is last-write-wins with no version check, so if this device has
   * unsaved edits AND the server's stamp has moved past what we last saw, another device has been
   * playing this board. Carrying on would silently destroy one side's progress.
   */
  it("reports a conflict when both sides have progress", () => {
    writeMirror(withUnsavedEdit(), board);

    // Another device saved this board since we last synced.
    const moved: BoardResponse = {
      ...board,
      currentState: PUZZLE.slice(0, 3) + "6" + PUZZLE.slice(4),
      lastModifiedAt: "2026-07-12T00:09:00Z",
    };

    const result = reconcile(moved, readMirror(7));
    expect(result.kind).toBe("conflict");
    if (result.kind !== "conflict") throw new Error("unreachable");

    // Both versions are offered, so the player can be given a real choice.
    expect(result.state.grid[2]).toBe(4); // this device
    expect(result.server.grid[3]).toBe(6); // the other one
  });

  it("never conflicts over a completed board — it is immutable and terminal", () => {
    writeMirror(withUnsavedEdit(), board);

    const done: BoardResponse = {
      ...board,
      status: "completed",
      currentState: SOLUTION,
      lastModifiedAt: "2026-07-12T00:09:00Z",
      completedAt: "2026-07-12T00:09:00Z",
    };

    expect(reconcile(done, readMirror(7)).kind).toBe("server");
  });
});
