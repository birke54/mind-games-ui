import { describe, expect, it } from "vitest";
import type { BoardResponse } from "../api/types";
import {
  gameReducer,
  hasUnsavedChanges,
  initialState,
  looksSolved,
  notesToWire,
  type GameAction,
  type GameState,
} from "./gameReducer";

const SOLUTION =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

// Cell 2 is empty in the deal (solution: 4). Cell 0 is a given (5).
const PUZZLE =
  "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

const board: BoardResponse = {
  id: 7,
  difficulty: "easy",
  status: "in_progress",
  puzzle: PUZZLE,
  currentState: PUZZLE,
  solution: SOLUTION,
  notes: {},
  elapsedSeconds: 0,
  claimedAt: "2026-07-12T00:00:00Z",
  completedAt: null,
  lastModifiedAt: "2026-07-12T00:00:00Z",
};

const run = (state: GameState, ...actions: GameAction[]) =>
  actions.reduce(gameReducer, state);

const fresh = () => initialState(board);
const at = (i: number) => ({ type: "SELECT", index: i }) as const;

describe("entering digits", () => {
  it("places a digit in the selected cell", () => {
    const s = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 4 });
    expect(s.grid[2]).toBe(4);
    expect(hasUnsavedChanges(s)).toBe(true);
  });

  it("refuses to overwrite a given", () => {
    const s = run(fresh(), at(0), { type: "INPUT_DIGIT", digit: 9 });
    expect(s.grid[0]).toBe(5);
    expect(hasUnsavedChanges(s)).toBe(false);
  });

  it("clears the cell when the digit already there is re-entered", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
      { type: "INPUT_DIGIT", digit: 4 },
    );
    expect(s.grid[2]).toBe(0);
  });

  it("does nothing when no cell is selected", () => {
    const s = gameReducer(fresh(), { type: "INPUT_DIGIT", digit: 4 });
    expect(hasUnsavedChanges(s)).toBe(false);
  });

  it("accepts a wrong-but-legal digit — the player is allowed to be wrong", () => {
    const s = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 2 });
    expect(s.grid[2]).toBe(2);
  });
});

describe("notes", () => {
  it("toggles a pencil mark in notes mode", () => {
    const s = run(fresh(), at(2), { type: "TOGGLE_NOTES_MODE" }, { type: "INPUT_DIGIT", digit: 4 });
    expect([...(s.notes.get(2) ?? [])]).toEqual([4]);

    const off = gameReducer(s, { type: "INPUT_DIGIT", digit: 4 });
    expect(off.notes.has(2)).toBe(false);
  });

  it("pencils a note without leaving digit mode when asNote is set", () => {
    const s = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 4, asNote: true });
    expect([...(s.notes.get(2) ?? [])]).toEqual([4]);
    expect(s.notesMode).toBe(false);
  });

  it("will not pencil a note into a cell that already holds a digit", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
      { type: "INPUT_DIGIT", digit: 7, asNote: true },
    );
    expect(s.notes.has(2)).toBe(false);
  });

  // Cell 3 is empty and shares row 0 with cell 2, so it is a peer that can actually hold notes.
  // (Cell 1 is a given — a note there is impossible, which would make this pass for free.)
  it("retires a digit's pencil marks from its peers when it is placed", () => {
    const s = run(
      fresh(),
      at(3),
      { type: "INPUT_DIGIT", digit: 4, asNote: true },
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
    );
    expect(s.notes.has(3)).toBe(false);
  });

  it("leaves a peer's other notes alone", () => {
    const s = run(
      fresh(),
      at(3),
      { type: "INPUT_DIGIT", digit: 7, asNote: true },
      { type: "INPUT_DIGIT", digit: 4, asNote: true },
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
    );
    expect([...(s.notes.get(3) ?? [])]).toEqual([7]);
  });

  it("serializes to the wire format the API expects", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4, asNote: true },
      { type: "INPUT_DIGIT", digit: 1, asNote: true },
    );
    expect(notesToWire(s.notes)).toEqual({ "2": [1, 4] });
  });
});

describe("erase", () => {
  it("clears a digit and its notes", () => {
    const s = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 4 }, { type: "ERASE" });
    expect(s.grid[2]).toBe(0);
    expect(s.notes.has(2)).toBe(false);
  });

  it("cannot erase a given", () => {
    const s = run(fresh(), at(0), { type: "ERASE" });
    expect(s.grid[0]).toBe(5);
    expect(hasUnsavedChanges(s)).toBe(false);
  });
});

describe("movement", () => {
  it("moves with arrow deltas", () => {
    const s = run(fresh(), at(40), { type: "MOVE", dRow: 1, dCol: 0 });
    expect(s.selected).toBe(49);
  });

  it("wraps across an edge", () => {
    const s = run(fresh(), at(8), { type: "MOVE", dRow: 0, dCol: 1 });
    expect(s.selected).toBe(0);
  });

  it("enters the grid at the top-left from no selection", () => {
    const s = gameReducer(fresh(), { type: "MOVE", dRow: 1, dCol: 0 });
    expect(s.selected).toBe(0);
  });
});

describe("undo and redo", () => {
  it("restores the previous grid", () => {
    const s = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 4 }, { type: "UNDO" });
    expect(s.grid[2]).toBe(0);
  });

  it("replays an undone move", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
      { type: "UNDO" },
      { type: "REDO" },
    );
    expect(s.grid[2]).toBe(4);
  });

  it("drops the redo stack once a new move is made", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
      { type: "UNDO" },
      { type: "INPUT_DIGIT", digit: 1 },
    );
    expect(s.future).toHaveLength(0);
  });

  it("undoes notes as well as digits", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4, asNote: true },
      { type: "UNDO" },
    );
    expect(s.notes.has(2)).toBe(false);
  });

  it("is a no-op with nothing to undo", () => {
    const s = gameReducer(fresh(), { type: "UNDO" });
    expect(hasUnsavedChanges(s)).toBe(false);
  });

  // Undo changes the board, so the server has to hear about it.
  it("marks the board unsaved", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
      { type: "SAVED", revision: 1, elapsedSeconds: 0, status: "in_progress", completedAt: null },
      { type: "UNDO" },
    );
    expect(hasUnsavedChanges(s)).toBe(true);
  });
});

describe("hints", () => {
  it("fills the selected cell with the right digit", () => {
    const s = run(fresh(), at(2), { type: "HINT" });
    expect(s.grid[2]).toBe(Number(SOLUTION[2]));
    expect(s.hintsUsed).toBe(1);
  });

  // A hint that quietly did nothing would leave the player waiting for something to happen.
  it("falls back to the first empty cell when nothing is selected", () => {
    const s = gameReducer(fresh(), { type: "HINT" });
    const firstEmpty = PUZZLE.indexOf("0");
    expect(s.grid[firstEmpty]).toBe(Number(SOLUTION[firstEmpty]));
  });

  it("does not waste itself on a cell that is already filled", () => {
    const filled = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 1 });
    const s = gameReducer(filled, { type: "HINT" });
    // Cell 2 was taken, so the hint went to the next empty cell and left 2 alone.
    expect(s.grid[2]).toBe(1);
  });

  it("pencils nothing — a hint is a committed digit even in notes mode", () => {
    const s = run(fresh(), at(2), { type: "TOGGLE_NOTES_MODE" }, { type: "HINT" });
    expect(s.grid[2]).toBe(Number(SOLUTION[2]));
    expect(s.notes.has(2)).toBe(false);
  });

  it("is undoable like any other move", () => {
    const s = run(fresh(), at(2), { type: "HINT" }, { type: "UNDO" });
    expect(s.grid[2]).toBe(0);
  });

  it("marks the board unsaved", () => {
    expect(hasUnsavedChanges(run(fresh(), at(2), { type: "HINT" }))).toBe(true);
  });
});

describe("check", () => {
  it("is off until asked for", () => {
    expect(fresh().checking).toBe(false);
  });

  it("toggles on and off", () => {
    const on = gameReducer(fresh(), { type: "CHECK" });
    expect(on.checking).toBe(true);
    expect(gameReducer(on, { type: "CHECK" }).checking).toBe(false);
  });

  // The marks describe the grid as it was when the player asked. Once they change it, those
  // marks are stale — and leaving them latched would live-flag every wrong digit as it's typed,
  // which is a much easier game than the one they asked for.
  it("is cleared by the next edit", () => {
    const s = run(
      fresh(),
      { type: "CHECK" },
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
    );
    expect(s.checking).toBe(false);
  });

  it("is cleared by an undo", () => {
    const s = run(
      fresh(),
      at(2),
      { type: "INPUT_DIGIT", digit: 4 },
      { type: "CHECK" },
      { type: "UNDO" },
    );
    expect(s.checking).toBe(false);
  });

  it("does not itself change the board", () => {
    const s = gameReducer(fresh(), { type: "CHECK" });
    expect(hasUnsavedChanges(s)).toBe(false);
  });
});

describe("the clock", () => {
  it("ticks while playing", () => {
    expect(gameReducer(fresh(), { type: "TICK" }).elapsedSeconds).toBe(1);
  });

  it("does not tick while paused", () => {
    const s = run(fresh(), { type: "SET_PAUSED", paused: true }, { type: "TICK" });
    expect(s.elapsedSeconds).toBe(0);
  });

  it("does not tick once the board is done", () => {
    const s = run(
      fresh(),
      { type: "SAVED", revision: 0, elapsedSeconds: 0, status: "completed", completedAt: "2026-07-12T00:01:00Z" },
      { type: "TICK" },
    );
    expect(s.elapsedSeconds).toBe(0);
  });
});

describe("saving", () => {
  // The player keeps typing while a save is in flight. Marking the board clean on the response
  // would silently discard those edits — this is why revision is a counter, not a boolean.
  it("keeps edits made while a save was in flight", () => {
    const typed = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 4 });
    const inFlightRevision = typed.revision;

    const typedMore = run(typed, at(3), { type: "INPUT_DIGIT", digit: 6 });
    const acked = gameReducer(typedMore, {
      type: "SAVED",
      revision: inFlightRevision,
      elapsedSeconds: 0,
      status: "in_progress",
      completedAt: null,
    });

    expect(hasUnsavedChanges(acked)).toBe(true);
  });

  it("is clean once the latest revision is acknowledged", () => {
    const typed = run(fresh(), at(2), { type: "INPUT_DIGIT", digit: 4 });
    const acked = gameReducer(typed, {
      type: "SAVED",
      revision: typed.revision,
      elapsedSeconds: typed.elapsedSeconds,
      status: "in_progress",
      completedAt: null,
    });
    expect(hasUnsavedChanges(acked)).toBe(false);
  });
});

describe("completion", () => {
  const solved = () => {
    // Fill every non-given cell with the solution.
    let s: GameState = fresh();
    for (let i = 0; i < 81; i++) {
      if (PUZZLE[i] !== "0") continue;
      s = run(s, at(i), { type: "INPUT_DIGIT", digit: Number(SOLUTION[i]) });
    }
    return s;
  };

  it("recognises a solved grid locally", () => {
    expect(looksSolved(solved())).toBe(true);
    expect(looksSolved(fresh())).toBe(false);
  });

  // The client only *predicts* completion; the server decides. Until it says so, the board is live.
  it("does not complete the board on its own", () => {
    expect(solved().status).toBe("in_progress");
  });

  it("completes only when the server says so", () => {
    const s = gameReducer(solved(), {
      type: "SAVED",
      revision: 1,
      elapsedSeconds: 0,
      status: "completed",
      completedAt: "2026-07-12T00:05:00Z",
    });
    expect(s.status).toBe("completed");
    expect(s.completedAt).toBe("2026-07-12T00:05:00Z");
  });

  it("freezes: a completed board takes no more input", () => {
    const done = gameReducer(solved(), {
      type: "SAVED",
      revision: 1,
      elapsedSeconds: 0,
      status: "completed",
      completedAt: "2026-07-12T00:05:00Z",
    });

    const after = run(done, at(2), { type: "INPUT_DIGIT", digit: 1 }, { type: "ERASE" }, {
      type: "UNDO",
    });
    expect(after.grid).toEqual(done.grid);
  });

  // A save that was already in flight can land after the completing one. It must not resurrect
  // the board.
  it("cannot be un-completed by a late in_progress save", () => {
    const done = gameReducer(solved(), {
      type: "SAVED",
      revision: 2,
      elapsedSeconds: 0,
      status: "completed",
      completedAt: "2026-07-12T00:05:00Z",
    });
    const late = gameReducer(done, {
      type: "SAVED",
      revision: 1,
      elapsedSeconds: 0,
      status: "in_progress",
      completedAt: null,
    });
    expect(late.status).toBe("completed");
  });
});
