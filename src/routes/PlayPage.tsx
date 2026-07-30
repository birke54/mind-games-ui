import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useReducer, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../api/client";
import type { BoardResponse } from "../api/types";
import { Board } from "../components/Board";
import { Controls } from "../components/Controls";
import { MatchProgress } from "../components/MatchProgress";
import { NumberPad } from "../components/NumberPad";
import { clearMirror, readMirror, reconcile } from "../game/boardMirror";
import { gameReducer, looksSolved } from "../game/gameReducer";
import { formatElapsed } from "../game/sudoku";
import { useAutosave, type SaveStatus } from "../game/useAutosave";
import { useGameTimer } from "../game/useGameTimer";
import { useMatch } from "../game/useMatch";
import { useKeyboard } from "../game/useKeyboard";

export default function PlayPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const id = Number(boardId);

  const query = useQuery({
    queryKey: ["board", id],
    // There is no GET /boards/{id}; the list is the only way to fetch one by id. When the board
    // was just claimed, Home has already seeded this cache entry and this never runs.
    queryFn: async () => (await api.listBoards()).find((b) => b.id === id) ?? null,
    enabled: Number.isFinite(id),
    staleTime: Infinity,
  });

  // The mirror holds the whole board, puzzle and solution included, precisely so the game can be
  // reconstructed without that fetch — and it answers for two cases, not one:
  //
  //  - **Offline.** The fetch cannot succeed at all. The service worker brings back the shell;
  //    this brings back the board.
  //  - **A board the list doesn't carry.** It returns the five most recent *unfinished* boards, so
  //    a finished one — or a sixth stale one — comes back absent rather than failing. Without this
  //    fallback, reloading the board you just solved says it isn't yours.
  //
  // Absent still means absent when there is no mirror either: a board belonging to someone else,
  // or a made-up id, has nothing to fall back to and lands on the message below.
  const mirrored = readMirror(id)?.board ?? null;
  const board = query.data ?? mirrored;

  if (query.isPending && !mirrored) return <Centered>Loading…</Centered>;
  if (!board) {
    return (
      <Centered>
        <p className="mb-4">That board isn&apos;t yours, or doesn&apos;t exist.</p>
        <Link to="/sudoku" className="text-sky-400 underline">
          Back
        </Link>
      </Centered>
    );
  }

  // Keyed on the id so switching boards rebuilds the reducer from scratch rather than carrying
  // the previous board's grid and undo history across.
  return <Game key={board.id} board={board} />;
}

function Game({ board }: { board: BoardResponse }) {
  const queryClient = useQueryClient();

  // Decide, once, which version of this board to open: the server's, the local mirror's (this
  // device's own unsaved work coming back), or — when both have moved — ask the player.
  const [resolution] = useState(() => reconcile(board, readMirror(board.id)));
  const [conflict, setConflict] = useState(resolution.kind === "conflict");

  const [state, dispatch] = useReducer(gameReducer, resolution.state);

  const onSaved = useCallback(
    (saved: BoardResponse) => {
      queryClient.setQueryData(["board", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
      // Stats are server-side totals now, so they go stale the moment a board completes. Only
      // then: this fires on every autosave, and an in-flight board moves no figure on that page.
      if (saved.status === "completed") {
        void queryClient.invalidateQueries({ queryKey: ["boardStats"] });
      }
    },
    [queryClient],
  );

  // Keys are handled page-wide, so clicking a control with the mouse doesn't silently kill
  // keyboard input. A frozen or paused board takes none.
  useKeyboard(dispatch, state.status === "in_progress" && !state.paused);

  useGameTimer(state, dispatch);
  const { status: saveStatus, flush } = useAutosave(state, dispatch, onSaved, board);

  // A completed grid is flushed at once instead of waiting out the debounce: this is the save
  // that completes the board server-side, and the player is sitting there waiting to be told
  // they've won.
  const solved = looksSolved(state);
  useEffect(() => {
    if (solved && state.status === "in_progress") flush();
  }, [solved, state.status, flush]);

  const done = state.status === "completed";

  // A match board follows its race alongside the board itself. The poll is what surfaces the
  // opponent's progress and, when they finish first, the result — the board's own save cycle only
  // ever hears about this player.
  const match = useMatch(board.matchId);
  const viewer = api.currentUsername();

  // A match board's solution is not on the client, so its hints come from the server. Local edits
  // are flushed first: the server reveals against the board *it* holds, so without the flush the
  // response could be computed from a stale grid and the revealed cell would be ambiguous.
  const hint = useMutation({
    mutationFn: async () => {
      flush();
      return api.revealHint(state.boardId, state.selected);
    },
    onSuccess: (revealed) => {
      const index = revealed.currentState
        .split("")
        .findIndex((digit, i) => digit !== "0" && state.grid[i] === 0);
      if (index >= 0) dispatch({ type: "REVEALED", index, digit: Number(revealed.currentState[index]) });
    },
  });

  const forfeit = useMutation({
    mutationFn: () => api.forfeitMatch(board.matchId as number),
    onSuccess: (updated) => queryClient.setQueryData(["match", updated.id], updated),
  });

  // Losing is the one outcome the board itself cannot show: this player's board is still in
  // progress, so nothing freezes and without this they would play on with no idea it was over.
  //
  // Neither outcome is tied to `done`. A player can lose a race and go on to finish their board,
  // and a forfeit hands someone the win while their own board is still in progress — so a race is
  // over when the *match* says so, whatever this board is doing.
  const result = match.data;
  const lost =
    result?.status === "finished" &&
    result.players.some((p) => p.username === viewer && p.userId !== result.winnerUserId);
  const won =
    result?.status === "finished" &&
    result.players.some((p) => p.username === viewer && p.userId === result.winnerUserId);

  /**
   * Which overlay is on screen — one value rather than a guard per overlay, because they are all
   * `absolute inset-0` in the same container with no z-index between them. Two truthy guards would
   * stack two backdrops and let the later sibling silently win the screen.
   *
   * A match board never shows "Solved" *while the race is known*: the result is the outcome that
   * matters, and the board finishing is only half of it. A winner is `done` up to one poll before
   * they are `won` (useMatch polls at 2s; the completing save is immediate), and that beat shows
   * nothing rather than flashing a solo "New game" at someone who just won a race.
   *
   * A race that will never report is a different thing entirely, and must not be read as "still
   * running": either there is no match data at all — offline, a 404, a failed poll — or it ended
   * abandoned, with no winner to name. A board solved there still deserves to say so, or finishing
   * one offline leaves the player staring at a frozen grid with no outcome at all.
   */
  const isMatch = board.matchId !== null;
  const noResultComing = !result || result.status === "abandoned";
  const overlay =
    state.paused && !done
      ? "paused"
      : isMatch
        ? won
          ? "won"
          : lost
            ? "lost"
            : noResultComing && done
              ? "solved"
              : null
        : done
          ? "solved"
          : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-3 py-3">
      {conflict && (
        <ConflictDialog
          onKeepLocal={() => {
            // Carry on from this device's state; the next save overwrites what the other device
            // left behind. Last-write-wins is the only tool the API gives us.
            setConflict(false);
          }}
          onTakeServer={() => {
            clearMirror(board.id);
            dispatch({ type: "HYDRATE", board });
            setConflict(false);
          }}
        />
      )}

      <header className="mb-3 flex items-center justify-between text-sm">
        <Link to="/sudoku" className="min-h-12 py-3 text-slate-400 hover:text-slate-200">
          ← Back
        </Link>
        <span className="capitalize text-slate-300">{board.difficulty}</span>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          <span className="tabular-nums text-slate-300">{formatElapsed(state.elapsedSeconds)}</span>
          {!done && (
            // Spelled out rather than a ⏸/▶ glyph: those are not in every font, and render as
            // tofu boxes where they're missing.
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_PAUSED", paused: !state.paused })}
              className="min-h-12 px-2 text-slate-400 hover:text-slate-200"
            >
              {state.paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </header>

      {/* Column on a phone (grid above, pad in the thumb zone); row on a desktop, where the
          controls become a side panel and the pad a 3x3 block under the mouse. */}
      <div className="flex flex-1 flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
        <div className="relative">
          <Board state={state} dispatch={dispatch} />

          {overlay === "paused" && (
            // Pausing must hide the board, or it becomes a way to stop the clock and keep
            // studying the grid.
            <Overlay>
              <p className="mb-4 text-xl">Paused</p>
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_PAUSED", paused: false })}
                className="btn-primary px-6"
              >
                Resume
              </button>
            </Overlay>
          )}

          {overlay === "lost" && (
            <Overlay>
              <p className="mb-2 text-2xl font-semibold text-slate-200">Opponent finished first</p>
              <p className="mb-6 text-slate-400">
                {result?.players.find((p) => p.userId === result.winnerUserId)?.username} won this
                race.
              </p>
              <Link to="/sudoku/multiplayer" className="btn-primary grid place-items-center px-6">
                Race again
              </Link>
            </Overlay>
          )}

          {overlay === "won" && (
            <Overlay>
              {/* Not "finished first": a forfeit is a win with nothing finished at all. */}
              <p className="mb-2 text-2xl font-semibold text-emerald-400">You won this race</p>
              <p className="mb-1 text-slate-300">
                {result?.players.find((p) => p.userId !== result.winnerUserId)?.username} lost this
                race.
              </p>
              <p className="mb-6 text-slate-400">
                {board.difficulty} · {formatElapsed(state.elapsedSeconds)}
              </p>
              <Link to="/sudoku/multiplayer" className="btn-primary grid place-items-center px-6">
                Race again
              </Link>
            </Overlay>
          )}

          {overlay === "solved" && (
            <Overlay>
              <p className="mb-2 text-2xl font-semibold text-emerald-400">Solved</p>
              <p className="mb-6 text-slate-300">
                {board.difficulty} · {formatElapsed(state.elapsedSeconds)}
              </p>
              <Link to="/sudoku/solo" className="btn-primary grid place-items-center px-6">
                New game
              </Link>
            </Overlay>
          )}
        </div>

        <div className="w-[min(92vw,32rem)] space-y-3 lg:w-64 lg:space-y-4">
          {match.data && (
            <MatchProgress
              match={match.data}
              viewer={viewer}
              onForfeit={() => forfeit.mutate()}
              forfeitPending={forfeit.isPending}
            />
          )}
          <Controls
            state={state}
            dispatch={dispatch}
            hintPending={hint.isPending}
            onHint={() =>
              state.solution === null ? hint.mutate() : dispatch({ type: "HINT" })
            }
          />
          <NumberPad state={state} dispatch={dispatch} />
          <p className="hidden text-xs leading-relaxed text-slate-400 lg:block">
            Arrows or WASD to move · 1–9 to enter · Shift+digit to pencil a note · N for notes mode
            · Backspace to erase · H for a hint · C to check · Ctrl+Z to undo
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * Both this device and another one have progress on this board, and saving is last-write-wins with
 * no version check — so one of them is about to be lost. The API gives us no way to merge, and
 * picking silently would mean destroying someone's work without telling them. So we ask.
 *
 * The right fix is optimistic concurrency on the backend (DESIGN.md §8, item 1); until then this
 * is the honest behaviour.
 */
function ConflictDialog({
  onKeepLocal,
  onTakeServer,
}: {
  onKeepLocal: () => void;
  onTakeServer: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      className="fixed inset-0 z-10 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 id="conflict-title" className="mb-2 text-lg font-semibold">
          This board moved on somewhere else
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-300">
          You have unsaved progress on this device, and the board was also played on another one.
          Keeping one means losing the other.
        </p>
        <div className="space-y-2">
          <button type="button" onClick={onKeepLocal} className="btn-primary w-full">
            Keep this device&apos;s progress
          </button>
          <button
            type="button"
            onClick={onTakeServer}
            className="min-h-12 w-full rounded-lg bg-slate-700 px-4 font-medium hover:bg-slate-600"
          >
            Load the other version
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Where the player's work currently is. "Offline" is a reassurance, not an error: the moves are
 * mirrored to localStorage and go up the moment the network returns, so nothing has been lost.
 */
function SaveIndicator({ status }: { status: SaveStatus }) {
  const text: Record<SaveStatus, string> = {
    saved: "Saved",
    pending: "…",
    saving: "Saving…",
    error: "Saved on this device",
  };
  return (
    <span
      role="status"
      className={status === "error" ? "text-xs text-amber-400" : "text-xs text-slate-400"}
    >
      {text[status]}
    </span>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-900/90 text-center backdrop-blur-sm">
      <div>{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center text-slate-400">
      <div>{children}</div>
    </div>
  );
}
