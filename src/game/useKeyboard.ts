import { useEffect } from "react";
import type { GameAction } from "./gameReducer";

/**
 * Desktop keyboard control, bound to the window rather than to the grid.
 *
 * Binding it to the grid element seems natural and is wrong: clicking any control — Notes, Check,
 * a number-pad digit — moves DOM focus onto that button, and every subsequent keystroke goes to
 * the button instead of the grid. The player clicks "Notes" with the mouse, types a digit, and
 * nothing happens. Keyboard control belongs to the page.
 *
 * The grid still owns *focus* (roving tabindex, so arrow keys narrate correctly to a screen
 * reader); it just no longer owns the key handling.
 */
export function useKeyboard(dispatch: (action: GameAction) => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      // Never steal keys from a text field — the login form, or anything added later.
      const target = e.target as HTMLElement | null;
      if (target?.matches?.("input, textarea, select, [contenteditable]")) return;

      const { key, ctrlKey, metaKey, shiftKey } = e;
      const mod = ctrlKey || metaKey;

      if (mod && key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: shiftKey ? "REDO" : "UNDO" });
        return;
      }
      if (mod && key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }
      if (mod) return; // leave browser shortcuts alone

      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        w: [-1, 0],
        s: [1, 0],
        a: [0, -1],
        d: [0, 1],
      };
      const move = moves[key];
      if (move) {
        e.preventDefault();
        dispatch({ type: "MOVE", dRow: move[0], dCol: move[1] });
        return;
      }

      if (/^[1-9]$/.test(key)) {
        e.preventDefault();
        // Shift+digit pencils a note without leaving the current mode — the fast path for a
        // player who is mostly entering digits.
        dispatch({
          type: "INPUT_DIGIT",
          digit: Number(key),
          ...(shiftKey ? { asNote: true } : {}),
        });
        return;
      }

      if (key === "Backspace" || key === "Delete" || key === "0") {
        e.preventDefault();
        dispatch({ type: "ERASE" });
        return;
      }

      const shortcuts: Record<string, GameAction> = {
        n: { type: "TOGGLE_NOTES_MODE" },
        h: { type: "HINT" },
        c: { type: "CHECK" },
      };
      const shortcut = shortcuts[key.toLowerCase()];
      if (shortcut) {
        e.preventDefault();
        dispatch(shortcut);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, enabled]);
}
