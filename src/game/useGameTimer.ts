import { useEffect } from "react";
import type { GameAction, GameState } from "./gameReducer";

/**
 * Drives the elapsed clock.
 *
 * `elapsedSeconds` is accumulated entirely by the client — the backend never infers it from
 * timestamps — so this hook is the source of truth for how long a board took.
 *
 * It ticks only while the tab is *visible*. A phone that goes in a pocket mid-game would otherwise
 * bank hours of "solving" time against the board. That's also why we count ticks rather than
 * diffing wall-clock timestamps: a backgrounded tab should record no time at all, not catch up on
 * the time it missed.
 */
export function useGameTimer(state: GameState, dispatch: (action: GameAction) => void): void {
  const running = state.status === "in_progress" && !state.paused;

  useEffect(() => {
    if (!running) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      interval ??= setInterval(() => dispatch({ type: "TICK" }), 1000);
    };
    const stop = () => {
      clearInterval(interval);
      interval = undefined;
    };

    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, dispatch]);
}
