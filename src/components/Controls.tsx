import type { GameAction, GameState } from "../game/gameReducer";

/**
 * Undo / redo / erase / notes / hint / check. The same row on both form factors: it sits between
 * the grid and the pad on mobile, and above the pad in the desktop side panel.
 */
export function Controls({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const frozen = state.status === "completed";
  const anyEmpty = state.grid.some((digit, i) => digit === 0 && state.puzzle[i] === "0");
  const anyEntered = state.grid.some((digit, i) => digit !== 0 && state.puzzle[i] === "0");

  return (
    <div className="grid grid-cols-6 gap-1.5 lg:gap-2" role="group" aria-label="Board controls">
      <ControlButton
        label="Undo"
        icon="↺"
        onClick={() => dispatch({ type: "UNDO" })}
        disabled={frozen || state.past.length === 0}
      />
      <ControlButton
        label="Redo"
        icon="↻"
        onClick={() => dispatch({ type: "REDO" })}
        disabled={frozen || state.future.length === 0}
      />
      <ControlButton
        label="Erase"
        icon="⌫"
        onClick={() => dispatch({ type: "ERASE" })}
        disabled={frozen || state.selected === null}
      />
      <ControlButton
        label="Notes"
        icon="✎"
        onClick={() => dispatch({ type: "TOGGLE_NOTES_MODE" })}
        disabled={frozen}
        active={state.notesMode}
      />
      <ControlButton
        label="Hint"
        icon="?"
        onClick={() => dispatch({ type: "HINT" })}
        disabled={frozen || !anyEmpty}
      />
      <ControlButton
        // A check with nothing entered would mark nothing and look broken, so it stays disabled
        // until the player has actually put something down to be wrong about.
        label="Check"
        icon="✓"
        onClick={() => dispatch({ type: "CHECK" })}
        disabled={frozen || !anyEntered}
        active={state.checking}
      />
    </div>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
  disabled,
  active = false,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={[
        "flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg",
        "text-[0.65rem] select-none disabled:opacity-30 lg:text-xs",
        // An active toggle must be unmistakable — a player who doesn't notice notes mode is on
        // will pencil marks they meant to commit.
        active ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-200 hover:bg-slate-600",
      ].join(" ")}
    >
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      {label}
    </button>
  );
}
