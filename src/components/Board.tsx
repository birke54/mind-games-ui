import { useEffect, useMemo, useRef } from "react";
import type { GameAction, GameState } from "../game/gameReducer";
import { conflicts, mistakes, peersOf } from "../game/sudoku";
import { Cell } from "./Cell";

/**
 * The 9x9 grid.
 *
 * It stays square at every viewport: `aspect-square` with a width clamped against both axes, so it
 * neither overflows a phone in portrait nor outgrows a desktop window. The DOM is a flat 81
 * children — box borders are drawn on the cells themselves rather than with nested 3x3 wrappers —
 * which keeps the CSS grid honest and the roving-focus model simple.
 *
 * Key handling lives in `useKeyboard`, on the window, not here: see the note in that file.
 */
export function Board({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  const conflicted = useMemo(() => conflicts(state.grid), [state.grid]);
  // Only computed when the player has actually asked. Otherwise the app would be quietly holding
  // the answer key up against their work the whole time.
  const mistaken = useMemo(
    () => (state.checking ? mistakes(state.grid, state.solution) : new Set<number>()),
    [state.checking, state.grid, state.solution],
  );

  const peers = useMemo(
    () => (state.selected === null ? new Set<number>() : new Set(peersOf(state.selected))),
    [state.selected],
  );
  const selectedDigit = state.selected === null ? 0 : (state.grid[state.selected] ?? 0);

  // Keep DOM focus on the selected cell so the roving tabindex actually roves — otherwise the
  // arrow keys move the highlight while focus stays behind, and a screen reader narrates the
  // wrong cell. Focus is only pulled back into the grid if it is not somewhere deliberate (a
  // control button the player just clicked); stealing it back would break those buttons.
  useEffect(() => {
    if (state.selected === null) return;
    // Query for the cell rather than indexing children: the direct children are the nine rows.
    const cell = gridRef.current?.querySelectorAll('[role="gridcell"]')[state.selected];
    const active = document.activeElement;
    const focusIsInGrid = active instanceof Node && gridRef.current?.contains(active);
    const focusIsLoose = active === null || active === document.body;

    if (cell instanceof HTMLElement && (focusIsInGrid || focusIsLoose) && active !== cell) {
      cell.focus();
    }
  }, [state.selected]);

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Sudoku board"
      aria-rowcount={9}
      aria-colcount={9}
      className="mx-auto grid aspect-square w-[min(92vw,60vh,32rem)] grid-cols-9 border-2 border-slate-400 bg-slate-900"
    >
      {/* ARIA requires a grid's cells to sit inside rows — a flat list of 81 gridcells is invalid
          and leaves a screen reader unable to announce position. `display: contents` gives us the
          row semantics without the row boxes becoming grid items, so the 9-column CSS grid still
          lays the cells out directly. */}
      {Array.from({ length: 9 }, (_, row) => (
        <div key={row} role="row" aria-rowindex={row + 1} className="contents">
          {state.grid.slice(row * 9, row * 9 + 9).map((digit, col) => {
            const i = row * 9 + col;
            return (
              <Cell
                key={i}
                index={i}
                digit={digit}
                notes={state.notes.get(i)}
                given={state.puzzle[i] !== "0"}
                selected={state.selected === i}
                peer={peers.has(i)}
                matching={digit !== 0 && digit === selectedDigit && state.selected !== i}
                conflicted={conflicted.has(i)}
                mistaken={mistaken.has(i)}
                frozen={state.status === "completed"}
                onSelect={(index) => dispatch({ type: "SELECT", index })}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
