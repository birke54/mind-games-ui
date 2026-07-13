import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import { DIFFICULTIES, type BoardResponse, type Difficulty } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { formatElapsed } from "../game/sudoku";
import { progressOf, relativeTime } from "../game/stats";

export default function HomePage() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const boards = useQuery({ queryKey: ["boards"], queryFn: api.listBoards });

  const claim = useMutation({
    mutationFn: (difficulty: Difficulty) => api.claimBoard(difficulty),
    onSuccess: (board) => {
      // Seed the cache so Play renders at once instead of refetching the board we were just handed.
      queryClient.setQueryData(["board", board.id], board);
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
      navigate(`/play/${board.id}`);
    },
  });

  // The API returns every board ever touched, newest activity first, and there is no way to
  // abandon one (see DESIGN.md §8) — so the list only grows. Show the recent few and no more.
  const inProgress = (boards.data ?? []).filter((b) => b.status === "in_progress");
  const recent = inProgress.slice(0, 5);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8">
      <header className="mb-10 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">
          Cortex Clash
        </h1>
        {/* The username is the first thing to go on a narrow screen — it's the least useful of
            the three, and keeping it wraps the title onto two lines. */}
        <nav className="flex items-baseline gap-4 text-sm whitespace-nowrap text-slate-400">
          <Link to="/stats" className="hover:text-slate-200">
            Stats
          </Link>
          <span className="hidden text-slate-400 sm:inline">{username}</span>
          <button onClick={() => void logout()} className="hover:text-slate-200">
            Sign out
          </button>
        </nav>
      </header>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-medium tracking-wide text-slate-400 uppercase">
          New game
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {DIFFICULTIES.map((difficulty) => (
            <button
              key={difficulty}
              onClick={() => claim.mutate(difficulty)}
              disabled={claim.isPending}
              className="btn-primary py-4 capitalize"
            >
              {difficulty}
            </button>
          ))}
        </div>

        {claim.isError && <ClaimError error={claim.error} />}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium tracking-wide text-slate-400 uppercase">
          In progress
        </h2>

        {boards.isPending && <p className="text-slate-400">Loading…</p>}
        {boards.isError && <p className="text-rose-400">Could not load your boards.</p>}
        {boards.isSuccess && inProgress.length === 0 && (
          <p className="text-slate-400">Nothing on the go. Start a new game above.</p>
        )}

        <ul className="space-y-2">
          {recent.map((board) => (
            <li key={board.id}>
              <ResumeButton board={board} onClick={() => navigate(`/play/${board.id}`)} />
            </li>
          ))}
        </ul>

        {inProgress.length > recent.length && (
          <p className="mt-3 text-xs text-slate-400">
            and {inProgress.length - recent.length} older
          </p>
        )}
      </section>
    </main>
  );
}

function ResumeButton({ board, onClick }: { board: BoardResponse; onClick: () => void }) {
  const progress = progressOf(board);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-left hover:border-slate-500"
    >
      <div className="flex items-baseline justify-between">
        <span className="capitalize">{board.difficulty}</span>
        <span className="text-sm text-slate-400 tabular-nums">
          {formatElapsed(board.elapsedSeconds)}
        </span>
      </div>

      {/* A meter, not a chart: one ratio against its limit. */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(progress * 100)}% filled`}
        className="mt-2 h-1 overflow-hidden rounded-full bg-slate-700"
      >
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${progress * 100}%` }} />
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {Math.round(progress * 100)}% filled · {relativeTime(board.lastModifiedAt)}
      </p>
    </button>
  );
}

function ClaimError({ error }: { error: unknown }) {
  // 503 is the expected, benign case: the pool for that difficulty is empty. A @Scheduled job
  // refills it every 5 minutes, so this really does resolve on its own.
  const message =
    error instanceof ApiError && error.status === 503
      ? "We're out of boards at that level for a moment — the generator is topping up. Try again shortly."
      : "Could not start a new game.";

  return (
    <p role="alert" className="mt-3 text-sm text-amber-400">
      {message}
    </p>
  );
}
