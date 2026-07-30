/**
 * A local mirror of the board being played, so that work is never only in a variable.
 *
 * Three jobs:
 *
 *  1. **Offline play.** The solution ships with the board, so a claimed board needs no network to
 *     be played.
 *
 *  2. **Reload.** The service worker brings the app shell back, but the board has to come from
 *     somewhere, and `GET /boards` — the only way to ask the server for one by id — can't always
 *     supply it: not offline, and not for a board it doesn't list (it returns the five most recent
 *     *unfinished* boards, so a solved one is never among them). So the mirror stores the **whole
 *     board**, puzzle and solution included, not just the moves: it has to be able to reconstruct
 *     the game on its own, or reloading loses it.
 *
 *     That is why a finished board keeps its mirror. Nothing local can change one — but nothing
 *     else can show it either.
 *
 *  3. **Detecting a board changed elsewhere.** Saves are last-write-wins with no version check
 *     (DESIGN.md §6), so a stale tab can silently destroy the progress made on another device. The
 *     mirror records the board as the server last gave it to us, `lastModifiedAt` included. On
 *     resume, if the server's stamp has moved on, someone else has been playing this board and we
 *     must ask rather than clobber.
 */

import type { BoardResponse } from "../api/types";
import {
  currentStateString,
  hasUnsavedEdits,
  initialState,
  notesFromWire,
  notesToWire,
  type GameState,
} from "./gameReducer";
import { parseGrid } from "./sudoku";

const KEY_PREFIX = "mind-games:board:";

export interface BoardMirror {
  /** The board as the server last gave it to us — puzzle, solution, difficulty, lastModifiedAt. */
  board: BoardResponse;
  /** The player's work on top of it. */
  currentState: string;
  notes: Record<string, number[]>;
  elapsedSeconds: number;
  revision: number;
  savedRevision: number;
  savedElapsedSeconds: number;
}

const keyFor = (boardId: number) => `${KEY_PREFIX}${boardId}`;

export function readMirror(boardId: number): BoardMirror | null {
  try {
    const raw = localStorage.getItem(keyFor(boardId));
    if (!raw) return null;
    const mirror = JSON.parse(raw) as BoardMirror;
    // A mirror from an older build, or a corrupted one, is not worth guessing at.
    return mirror.board?.id === boardId && typeof mirror.currentState === "string"
      ? mirror
      : null;
  } catch {
    return null;
  }
}

export function writeMirror(state: GameState, board: BoardResponse): void {
  try {
    const mirror: BoardMirror = {
      board,
      currentState: currentStateString(state),
      notes: notesToWire(state.notes),
      elapsedSeconds: state.elapsedSeconds,
      revision: state.revision,
      savedRevision: state.savedRevision,
      savedElapsedSeconds: state.savedElapsedSeconds,
    };
    localStorage.setItem(keyFor(state.boardId), JSON.stringify(mirror));
  } catch {
    // A full or disabled localStorage must never break the game. Play continues in memory.
  }
}

export function clearMirror(boardId: number): void {
  try {
    localStorage.removeItem(keyFor(boardId));
  } catch {
    /* nothing to do */
  }
}

export type Reconciliation =
  | { kind: "server"; state: GameState }
  | { kind: "local"; state: GameState }
  | { kind: "conflict"; state: GameState; server: GameState };

/**
 * Decides which version of a board to open.
 *
 * - **server** — nothing local worth keeping. The board as the API returned it.
 * - **local** — the mirror is the server's state plus edits this device made and hasn't uploaded
 *   (we went offline, or the tab died mid-debounce). Resume from it silently; that's just this
 *   device's own work coming back.
 * - **conflict** — the server's `lastModifiedAt` has moved past what this device last saw, *and*
 *   this device has unsaved edits. Both sides have progress and one of them is about to be lost.
 *   The player picks. This is the multi-device case the backend can't help with, because it has
 *   no optimistic concurrency.
 */
export function reconcile(board: BoardResponse, mirror: BoardMirror | null): Reconciliation {
  const server = initialState(board);

  // A completed board is immutable and terminal; nothing local can matter.
  if (!mirror || board.status === "completed") return { kind: "server", state: server };

  const local = restore(board, mirror);
  const localHasEdits = hasUnsavedEdits(local) || local.elapsedSeconds > local.savedElapsedSeconds;
  const serverMovedOn = mirror.board.lastModifiedAt !== board.lastModifiedAt;

  if (!localHasEdits) return { kind: "server", state: server };
  if (!serverMovedOn) return { kind: "local", state: local };

  return { kind: "conflict", state: local, server };
}

/** Rebuilds game state from the board (for puzzle/solution) and the mirror (for the player's work). */
function restore(board: BoardResponse, mirror: BoardMirror): GameState {
  const base = initialState(board);
  return {
    ...base,
    grid: parseGrid(mirror.currentState),
    notes: notesFromWire(mirror.notes),
    elapsedSeconds: mirror.elapsedSeconds,
    revision: mirror.revision,
    savedRevision: mirror.savedRevision,
    savedElapsedSeconds: mirror.savedElapsedSeconds,
  };
}
