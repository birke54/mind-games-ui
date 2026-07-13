import { useMemo } from "react";
import type { GameAction, GameState } from "../game/gameReducer";
import { digitCounts } from "../game/sudoku";

/**
 * The digit entry surface — and on a phone, the *only* one.
 *
 * The cells are buttons, never <input>s, precisely so tapping one cannot raise the native
 * keyboard: on iOS that would slide up and shove the board off screen. Digits come from here.
 *
 * Targets are at least 48px tall, above the 44px WCAG 2.5.5 / Apple HIG floor, and the pad sits at
 * the bottom of the layout on mobile where a thumb can reach it.
 */
export function NumberPad({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const counts = useMemo(() => digitCounts(state.grid), [state.grid]);
  const frozen = state.status === "completed";

  return (
    <div
      className="grid grid-cols-9 gap-1.5 lg:grid-cols-3 lg:gap-2"
      role="group"
      aria-label="Number pad"
    >
      {Array.from({ length: 9 }, (_, n) => n + 1).map((digit) => {
        // All nine placed: the digit is spent. Greying it out saves the player scanning the
        // grid to work that out for themselves.
        const exhausted = (counts[digit] ?? 0) >= 9;
        return (
          <button
            key={digit}
            type="button"
            onClick={() => dispatch({ type: "INPUT_DIGIT", digit })}
            disabled={frozen || exhausted}
            aria-label={`Enter ${digit}${state.notesMode ? " as a note" : ""}`}
            className={[
              "min-h-12 touch-manipulation rounded-lg text-xl font-medium tabular-nums select-none",
              "disabled:opacity-25",
              state.notesMode
                ? "bg-slate-700 text-amber-300 hover:bg-slate-600"
                : "bg-slate-700 text-slate-100 hover:bg-slate-600",
              "lg:min-h-16 lg:text-2xl",
            ].join(" ")}
          >
            {digit}
          </button>
        );
      })}
    </div>
  );
}
