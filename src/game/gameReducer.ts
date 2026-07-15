/**
 * The game rules, as a pure reducer. Nothing here touches the network, the clock, or the DOM —
 * which is what lets the whole rule set be tested directly, and why the components below it can
 * stay dumb.
 *
 * The board is 81 cells, row-major, 0 = empty. Notes are per-cell sets of pencilled digits.
 */

import type { BoardResponse, BoardStatus } from "../api/types";
import { CELLS, isSolved, parseGrid, peersOf, serializeGrid } from "./sudoku";

export type Notes = ReadonlyMap<number, ReadonlySet<number>>;

/** What undo restores. Selection is deliberately not part of it — undoing a digit shouldn't
 *  yank the cursor somewhere else. */
interface Snapshot {
  grid: readonly number[];
  notes: Notes;
}

export interface GameState {
  boardId: number;
  puzzle: string;
  solution: string;

  grid: number[];
  notes: Notes;

  selected: number | null;
  notesMode: boolean;
  paused: boolean;

  /**
   * The player asked "am I right so far?". A one-shot: it marks the cells that disagree with the
   * solution, and any edit clears it. Left latched on, it would live-mark every wrong digit as it
   * was typed, which is a different (and much easier) game.
   */
  checking: boolean;
  /** Hints taken. Client-only — the backend has nowhere to record it, so it resets on reload. */
  hintsUsed: number;

  elapsedSeconds: number;
  status: BoardStatus;
  completedAt: string | null;

  past: Snapshot[];
  future: Snapshot[];

  /**
   * Bumped on every change the server needs to hear about. Autosave records which revision it
   * persisted, so "are there unsaved edits?" is `revision !== savedRevision` — which stays correct
   * even when the player keeps typing while a save is in flight. A boolean `dirty` flag would be
   * cleared by that in-flight save and lose the edits made during it.
   */
  revision: number;
  savedRevision: number;
  /** The elapsed time the server last acknowledged. The clock advances without changing
   *  `revision` (a tick is not an edit), so time drifts out of sync on its own and needs its
   *  own high-water mark — otherwise a long think followed by a closed tab loses the minutes. */
  savedElapsedSeconds: number;
}

export type GameAction =
  | { type: "HYDRATE"; board: BoardResponse }
  | { type: "SELECT"; index: number }
  | { type: "MOVE"; dRow: number; dCol: number }
  | { type: "INPUT_DIGIT"; digit: number; asNote?: boolean }
  | { type: "ERASE" }
  | { type: "HINT" }
  | { type: "CHECK" }
  | { type: "TOGGLE_NOTES_MODE" }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "TICK" }
  | {
      type: "SAVED";
      revision: number;
      elapsedSeconds: number;
      status: BoardStatus;
      completedAt: string | null;
    };

export function notesFromWire(wire: Record<string, number[]>): Notes {
  const notes = new Map<number, ReadonlySet<number>>();
  for (const [index, digits] of Object.entries(wire)) {
    if (digits.length > 0) notes.set(Number(index), new Set(digits));
  }
  return notes;
}

export function notesToWire(notes: Notes): Record<string, number[]> {
  const wire: Record<string, number[]> = {};
  for (const [index, digits] of notes) {
    if (digits.size > 0) wire[String(index)] = [...digits].sort((a, b) => a - b);
  }
  return wire;
}

export function initialState(board: BoardResponse): GameState {
  return {
    boardId: board.id,
    puzzle: board.puzzle,
    solution: board.solution,
    grid: parseGrid(board.currentState),
    notes: notesFromWire(board.notes),
    selected: null,
    notesMode: false,
    paused: false,
    checking: false,
    hintsUsed: 0,
    elapsedSeconds: board.elapsedSeconds,
    status: board.status,
    completedAt: board.completedAt,
    past: [],
    future: [],
    revision: 0,
    savedRevision: 0,
    savedElapsedSeconds: board.elapsedSeconds,
  };
}

const isGivenAt = (state: GameState, i: number) => state.puzzle[i] !== "0";
const isFrozen = (state: GameState) => state.status === "completed";

/**
 * Applies a grid/notes change: records undo, drops redo, marks the board unsaved, and retires any
 * outstanding check — the marks it drew describe a grid that no longer exists.
 */
function commit(state: GameState, next: { grid: number[]; notes: Notes }): GameState {
  return {
    ...state,
    grid: next.grid,
    notes: next.notes,
    past: [...state.past, { grid: state.grid, notes: state.notes }],
    future: [],
    revision: state.revision + 1,
    checking: false,
  };
}

function withoutNote(notes: Notes, index: number): Notes {
  if (!notes.has(index)) return notes;
  const next = new Map(notes);
  next.delete(index);
  return next;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "HYDRATE":
      return initialState(action.board);

    case "SELECT":
      return action.index >= 0 && action.index < CELLS
        ? { ...state, selected: action.index }
        : state;

    case "MOVE": {
      // Wraps at the edges, so arrow-keying off the right edge lands on the next row. From no
      // selection, the first arrow press enters at the top-left.
      const from = state.selected ?? 0;
      if (state.selected === null) return { ...state, selected: 0 };
      const row = (Math.floor(from / 9) + action.dRow + 9) % 9;
      const col = ((from % 9) + action.dCol + 9) % 9;
      return { ...state, selected: row * 9 + col };
    }

    case "INPUT_DIGIT": {
      const i = state.selected;
      if (i === null || isFrozen(state) || isGivenAt(state, i)) return state;
      if (action.digit < 1 || action.digit > 9) return state;

      const asNote = action.asNote ?? state.notesMode;

      if (asNote) {
        // A note on a filled cell is meaningless — the digit is already committed there.
        if (state.grid[i] !== 0) return state;
        const current = state.notes.get(i) ?? new Set<number>();
        const digits = new Set(current);
        if (digits.has(action.digit)) digits.delete(action.digit);
        else digits.add(action.digit);

        const notes = new Map(state.notes);
        if (digits.size === 0) notes.delete(i);
        else notes.set(i, digits);

        return commit(state, { grid: state.grid, notes });
      }

      // Re-entering the digit already there clears it, so one key both sets and unsets.
      const grid = [...state.grid];
      const clearing = grid[i] === action.digit;
      grid[i] = clearing ? 0 : action.digit;

      let notes = withoutNote(state.notes, i);
      if (!clearing) {
        // Placing a digit retires that pencil mark everywhere it can no longer be true.
        for (const peer of peersOf(i)) {
          const peerNotes = notes.get(peer);
          if (!peerNotes?.has(action.digit)) continue;
          const digits = new Set(peerNotes);
          digits.delete(action.digit);
          const next = new Map(notes);
          if (digits.size === 0) next.delete(peer);
          else next.set(peer, digits);
          notes = next;
        }
      }

      return commit(state, { grid, notes });
    }

    case "ERASE": {
      const i = state.selected;
      if (i === null || isFrozen(state) || isGivenAt(state, i)) return state;
      if (state.grid[i] === 0 && !state.notes.has(i)) return state;

      const grid = [...state.grid];
      grid[i] = 0;
      return commit(state, { grid, notes: withoutNote(state.notes, i) });
    }

    case "HINT": {
      // Fills the selected cell with the right digit. The solution is already on the client, so
      // this costs nothing and works offline. If the selection is missing or already filled, take
      // the first empty cell — a hint should never be a no-op the player has to puzzle over.
      if (isFrozen(state)) return state;

      const eligible = (i: number) => !isGivenAt(state, i) && state.grid[i] === 0;
      const target =
        state.selected !== null && eligible(state.selected)
          ? state.selected
          : state.grid.findIndex((_, i) => eligible(i));
      if (target < 0) return state;

      const digit = Number(state.solution[target]);
      const filled = gameReducer(
        { ...state, selected: target, notesMode: false },
        { type: "INPUT_DIGIT", digit },
      );
      return { ...filled, hintsUsed: state.hintsUsed + 1 };
    }

    case "CHECK":
      return isFrozen(state) ? state : { ...state, checking: !state.checking };

    case "TOGGLE_NOTES_MODE":
      return { ...state, notesMode: !state.notesMode };

    case "SET_PAUSED":
      return isFrozen(state) ? state : { ...state, paused: action.paused };

    case "UNDO": {
      const previous = state.past.at(-1);
      if (!previous || isFrozen(state)) return state;
      return {
        ...state,
        grid: [...previous.grid],
        notes: previous.notes,
        past: state.past.slice(0, -1),
        future: [{ grid: state.grid, notes: state.notes }, ...state.future],
        revision: state.revision + 1,
        checking: false,
      };
    }

    case "REDO": {
      const [next, ...rest] = state.future;
      if (!next || isFrozen(state)) return state;
      return {
        ...state,
        grid: [...next.grid],
        notes: next.notes,
        past: [...state.past, { grid: state.grid, notes: state.notes }],
        future: rest,
        revision: state.revision + 1,
        checking: false,
      };
    }

    case "TICK":
      return isFrozen(state) || state.paused
        ? state
        : { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    case "SAVED":
      // The server is the authority on completion, not us. It also can't go backwards: a save
      // that lands after a completing one must not un-complete the board.
      return {
        ...state,
        savedRevision: Math.max(state.savedRevision, action.revision),
        savedElapsedSeconds: Math.max(state.savedElapsedSeconds, action.elapsedSeconds),
        status: state.status === "completed" ? "completed" : action.status,
        completedAt: state.completedAt ?? action.completedAt,
        ...(action.status === "completed" ? { paused: false, selected: null } : {}),
      };

    default:
      return state;
  }
}

/** An edit the server has not acknowledged. Drives the debounce — ticks must not restart it. */
export const hasUnsavedEdits = (s: GameState): boolean => s.revision !== s.savedRevision;

/** Anything at all worth sending, including elapsed time that has drifted without any edit. */
export const hasUnsavedChanges = (s: GameState): boolean =>
  hasUnsavedEdits(s) || s.elapsedSeconds !== s.savedElapsedSeconds;

/** Whether the grid now matches the solution. The client predicts completion; the server rules. */
export const looksSolved = (s: GameState): boolean => isSolved(s.grid, s.solution);

export const currentStateString = (s: GameState): string => serializeGrid(s.grid);
