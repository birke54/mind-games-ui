import { memo } from "react";
import { colOf, rowOf } from "../game/sudoku";

export interface CellProps {
  index: number;
  digit: number;
  notes: ReadonlySet<number> | undefined;
  given: boolean;
  selected: boolean;
  /** Holds the same digit as the selected cell. */
  matching: boolean;
  /** Duplicates a digit among its peers. */
  conflicted: boolean;
  /** Disagrees with the solution — only known after the player asks for a check. */
  mistaken: boolean;
  frozen: boolean;
  onSelect: (index: number) => void;
}

/**
 * One cell. Rendered 81 times per keystroke, so it's memoized on the handful of booleans that
 * actually change its appearance.
 */
export const Cell = memo(function Cell({
  index,
  digit,
  notes,
  given,
  selected,
  matching,
  conflicted,
  mistaken,
  frozen,
  onSelect,
}: CellProps) {
  const row = rowOf(index);
  const col = colOf(index);
  const wrong = conflicted || mistaken;

  // Given (clue) cells carry a slightly lighter fill than the empty cells the player can edit, so
  // the fixed scaffold of the puzzle reads at a glance. Selection/match/mistake states still win.
  const background = mistaken
    ? "bg-rose-500/25"
    : selected
      ? "bg-sky-500/30"
      : matching
        ? "bg-sky-500/15"
        : given
          ? "bg-slate-700/50"
          : "bg-slate-900";

  const digitColor = wrong ? "text-rose-400" : given ? "text-slate-100" : "text-sky-300";

  return (
    <button
      type="button"
      role="gridcell"
      aria-colindex={col + 1}
      // Roving tabindex: the grid is a single tab stop and the arrow keys move within it, which
      // is what a screen-reader / keyboard user expects of a grid — 81 tab stops would not be.
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-readonly={given || frozen}
      aria-label={
        `row ${row + 1}, column ${col + 1}, ` +
        (digit === 0 ? (notes?.size ? `notes ${[...notes].sort().join(" ")}` : "empty") : digit) +
        (given ? ", given" : "") +
        (conflicted ? ", conflict" : "") +
        (mistaken ? ", incorrect" : "")
      }
      onClick={() => onSelect(index)}
      className={[
        "relative grid place-items-center border border-slate-700/80 leading-none",
        // touch-action kills the 300ms double-tap-zoom delay; without it every tap feels laggy.
        "touch-manipulation select-none focus:outline-none",
        background,
        digitColor,
        given ? "font-semibold" : "font-normal",
        // The 3x3 rules, drawn as heavier edges where a box begins.
        col % 3 === 0 && col !== 0 ? "border-l-2 border-l-slate-400" : "",
        row % 3 === 0 && row !== 0 ? "border-t-2 border-t-slate-400" : "",
        selected ? "ring-2 ring-inset ring-sky-400" : "",
        // Wrongness must not be signalled by colour alone — that fails WCAG 1.4.1 and anyone
        // with a red-green deficiency. The ring carries the same message, and so does the
        // accessible name above.
        wrong && !selected ? "ring-2 ring-inset ring-rose-500/70" : "",
      ].join(" ")}
      style={{ fontSize: "clamp(1rem, 5vw, 1.75rem)" }}
    >
      {digit !== 0 ? (
        digit
      ) : notes?.size ? (
        <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[6%] text-slate-400">
          {Array.from({ length: 9 }, (_, n) => (
            <span
              key={n}
              className="grid place-items-center"
              style={{ fontSize: "clamp(0.4rem, 1.6vw, 0.65rem)" }}
            >
              {notes.has(n + 1) ? n + 1 : ""}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
});
