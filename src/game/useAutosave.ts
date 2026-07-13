import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import type { BoardResponse } from "../api/types";
import { clearMirror, writeMirror } from "./boardMirror";
import {
  currentStateString,
  hasUnsavedChanges,
  hasUnsavedEdits,
  notesToWire,
  type GameAction,
  type GameState,
} from "./gameReducer";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

const DEBOUNCE_MS = 2000;

/**
 * Persists the board.
 *
 * Saves are whole-state PUTs — the server applies no deltas — so we debounce: a burst of typing
 * becomes one request rather than one per keystroke. A debounce alone would lose the last edits
 * when a player closes the tab or backgrounds the app mid-burst, which on mobile is the *normal*
 * way to leave, so we also flush on `visibilitychange -> hidden` and on `pagehide`.
 *
 * The debounce is keyed on `state.revision` — the edit counter — and deliberately NOT on the
 * whole state. The clock ticks once a second, producing a new state object each time; keying on
 * that would reset the 2s debounce every second and it would never fire at all. (It did exactly
 * that, and no save ever left the browser.) Ticks are not edits, so they schedule nothing; the
 * elapsed time they accumulate rides along with the next save, or with the flush on the way out.
 *
 * Completion is flushed immediately rather than debounced: the save that first matches the
 * solution is the one that completes the board server-side, and the player is waiting to be told
 * they've won.
 */
export function useAutosave(
  state: GameState,
  dispatch: (action: GameAction) => void,
  onSaved?: (board: BoardResponse) => void,
  /** The board as the server last gave it to us. Stored whole in the mirror so the game can be
   *  reconstructed offline, where GET /boards is unreachable. */
  board?: BoardResponse,
): { status: SaveStatus; flush: () => void } {
  // Only the things the state itself cannot tell us are stored: whether a request is in flight,
  // and whether the last one failed. "pending" and "saved" are *derived* from the revision
  // counters below.
  //
  // The tempting shortcut — setStatus(...) right after dispatch(SAVED) — reads stateRef.current
  // before React has re-rendered, so it still sees the pre-save revision, concludes there are
  // unsaved edits, and pins the indicator on "pending" forever. Derive, don't capture.
  const [phase, setPhase] = useState<"idle" | "saving" | "error">("idle");

  // The save runs from timers and event listeners that outlive any given render, so it reads the
  // live state through a ref rather than closing over a stale copy.
  const stateRef = useRef(state);
  stateRef.current = state;

  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const serverBoard = useRef(board);
  if (board && !serverBoard.current) serverBoard.current = board;

  const save = useCallback(async () => {
    const snapshot = stateRef.current;
    if (inFlight.current || !hasUnsavedChanges(snapshot) || snapshot.status === "completed") {
      return;
    }

    // Pin the revision and elapsed time *before* the request: the player can keep playing while
    // it is in flight, and we must only mark what we actually sent as saved, not whatever they
    // have reached by the time the response lands.
    const { revision, elapsedSeconds } = snapshot;

    inFlight.current = true;
    setPhase("saving");
    try {
      const saved = await api.saveProgress(snapshot.boardId, {
        currentState: currentStateString(snapshot),
        notes: notesToWire(snapshot.notes),
        elapsedSeconds,
      });
      dispatch({
        type: "SAVED",
        revision,
        elapsedSeconds,
        status: saved.status,
        completedAt: saved.completedAt,
      });
      // The response is the newest the server has, stamp included — so it becomes what the mirror
      // considers "in sync", and what a later resume compares against.
      serverBoard.current = saved;
      onSaved?.(saved);
      setPhase("idle");
    } catch (err) {
      // 409 means the board was already completed — terminal, and not an error to the player.
      // Completion is exactly what they were trying to reach.
      if (err instanceof ApiError && err.status === 409) {
        dispatch({
          type: "SAVED",
          revision,
          elapsedSeconds,
          status: "completed",
          completedAt: new Date().toISOString(),
        });
        setPhase("idle");
      } else {
        // Anything else (offline, 5xx) leaves the edits unsaved. They stay in memory, and the
        // next edit — or the next flush — retries.
        setPhase("error");
      }
    } finally {
      inFlight.current = false;
    }
  }, [dispatch, onSaved]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    void save();
  }, [save]);

  // Debounced save, restarted by each edit. See the note above about why the dependency is the
  // revision counter and not `state`.
  const edited = hasUnsavedEdits(state);
  const completed = state.status === "completed";

  // Mirror locally on every change. This is what makes an unsaved move survive a reload, a dead
  // tab, or a tunnel — the network save is best-effort on top of it. A completed board is
  // immutable server-side, so its mirror is dead weight.
  useEffect(() => {
    if (completed) clearMirror(state.boardId);
    else if (serverBoard.current) writeMirror(state, serverBoard.current);
  }, [state, completed]);

  useEffect(() => {
    if (!edited || completed) return;

    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);

    return () => clearTimeout(timer.current);
  }, [state.revision, edited, completed, save]);

  // Leaving the page or backgrounding the app must not cost the player their last few moves —
  // or the time on the clock, which no edit would otherwise have carried up. And when the network
  // comes back, whatever piled up while it was gone goes straight out.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  const status: SaveStatus =
    phase === "error" ? "error" : phase === "saving" ? "saving" : edited ? "pending" : "saved";

  return { status, flush };
}
