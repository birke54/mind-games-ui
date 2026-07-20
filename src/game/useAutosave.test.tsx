import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { BoardResponse } from "../api/types";
import { gameReducer, initialState, type GameAction, type GameState } from "./gameReducer";
import { useAutosave } from "./useAutosave";

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

const saveProgress = vi.spyOn(api, "saveProgress");

/** Drives the hook with the real reducer, so the transitions are the ones the app actually makes. */
function renderAutosave(start: GameState = initialState(board)) {
  let state = start;
  const dispatch = vi.fn((action: GameAction) => {
    state = gameReducer(state, action);
    rerender();
  });

  const { result, rerender: doRerender } = renderHook(() => useAutosave(state, dispatch));
  const rerender = () => doRerender();

  return {
    result,
    dispatch,
    /** Apply an action the way the UI would, then re-render the hook with the new state. */
    act: (action: GameAction) => {
      act(() => {
        state = gameReducer(state, action);
      });
      act(() => rerender());
    },
    get state() {
      return state;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  saveProgress.mockReset();
  saveProgress.mockResolvedValue({ ...board, status: "in_progress" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("saves once, after the debounce, for a burst of edits", async () => {
    const game = renderAutosave();

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });
    game.act({ type: "SELECT", index: 3 });
    game.act({ type: "INPUT_DIGIT", digit: 6 });

    expect(saveProgress).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(saveProgress).toHaveBeenCalledOnce();
  });

  /**
   * The regression that matters. The clock ticks once a second, producing a new state object each
   * time. When the debounce effect depended on `state`, every tick restarted the 2s timer and the
   * save never fired — no progress ever left the browser. A tick is not an edit and must not
   * reschedule anything.
   */
  it("still saves while the clock is ticking", async () => {
    const game = renderAutosave();

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });

    // Three seconds of play, with the clock ticking every second as it really does.
    for (let second = 0; second < 3; second++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      game.act({ type: "TICK" });
    }

    expect(saveProgress).toHaveBeenCalledOnce();
  });

  // The status has to be derived from state, not captured after dispatch — capturing reads a
  // stale ref and pins the indicator on "pending" forever, so the player never sees "Saved".
  it("reports saved once the save lands", async () => {
    const game = renderAutosave();

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });
    expect(game.result.current.status).toBe("pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(game.result.current.status).toBe("saved");
  });

  it("sends the whole board state, since the server applies no deltas", async () => {
    const game = renderAutosave();

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });
    game.act({ type: "SELECT", index: 3 });
    game.act({ type: "INPUT_DIGIT", digit: 6, asNote: true });
    game.act({ type: "TICK" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    const [boardId, progress] = saveProgress.mock.calls[0]!;
    expect(boardId).toBe(7);
    expect(progress.currentState).toHaveLength(81);
    expect(progress.currentState[2]).toBe("4");
    expect(progress.notes).toEqual({ "3": [6] });
    expect(progress.elapsedSeconds).toBe(1);
  });

  it("does not save when there is nothing to send", async () => {
    renderAutosave();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(saveProgress).not.toHaveBeenCalled();
  });

  it("treats a 409 as completion rather than an error — the board was already solved", async () => {
    saveProgress.mockRejectedValue(new ApiError(409, "Board already completed"));
    const game = renderAutosave();

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(game.state.status).toBe("completed");
    expect(game.result.current.status).toBe("saved");
  });

  it("reports an error and keeps the edits when the save fails", async () => {
    saveProgress.mockRejectedValue(new ApiError(500, "boom"));
    const game = renderAutosave();

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(game.result.current.status).toBe("error");
    expect(game.state.grid[2]).toBe(4); // the player's work is still there
  });

  it("flushes immediately, without waiting out the debounce", async () => {
    const game = renderAutosave();

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });

    await act(async () => {
      game.result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(saveProgress).toHaveBeenCalledOnce();
  });

  // Time accumulates without any edit, so a player who thinks for ten minutes and then closes the
  // tab has ten minutes to lose. The flush on the way out has to carry it.
  it("flushes elapsed time even when nothing was edited", async () => {
    const game = renderAutosave();

    game.act({ type: "TICK" });
    game.act({ type: "TICK" });

    await act(async () => {
      game.result.current.flush();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(saveProgress).toHaveBeenCalledOnce();
    expect(saveProgress.mock.calls[0]![1].elapsedSeconds).toBe(2);
  });

  it("stops saving once the board is completed", async () => {
    const game = renderAutosave();
    game.act({
      type: "SAVED",
      revision: 0,
      elapsedSeconds: 0,
      status: "completed",
      completedAt: "2026-07-12T00:05:00Z",
    });

    game.act({ type: "SELECT", index: 2 });
    game.act({ type: "INPUT_DIGIT", digit: 4 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(saveProgress).not.toHaveBeenCalled();
  });
});
