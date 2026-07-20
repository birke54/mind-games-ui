import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import { DIFFICULTIES, type Difficulty, type MatchResponse } from "../api/types";
import { MultiplayerIcon } from "../components/GameIcons";
import { useMatch } from "../game/useMatch";

/**
 * The lobby: open a race and share the code, or redeem someone else's.
 *
 * A host sits here polling until an opponent redeems the code, at which point the server deals both
 * boards and this page hands off to the board. A joiner never waits — their redemption is what
 * starts the race, so they get a board id back from the join itself.
 */
export default function MultiplayerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [hosted, setHosted] = useState<MatchResponse | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // While hosting, watch for the opponent arriving. Nothing to poll before that, or after.
  const hostedMatch = useMatch(hosted?.status === "waiting" ? hosted.id : null);
  const live = hostedMatch.data ?? hosted;

  // The host's poll is the only thing that can tell them the race has begun.
  useEffect(() => {
    if (live?.status !== "active" || live.boardId === null) return;
    queryClient.setQueryData(["match", live.id], live);
    navigate(`/play/${live.boardId}`);
  }, [live, navigate, queryClient]);

  const create = useMutation({
    mutationFn: (difficulty: Difficulty) => api.createMatch(difficulty),
    onSuccess: (match) => {
      setError(null);
      setHosted(match);
    },
    onError: (err: unknown) => setError(messageFor(err, "Could not open a match.")),
  });

  const join = useMutation({
    mutationFn: (code: string) => api.joinMatch(code),
    onSuccess: (match) => {
      setError(null);
      if (match.boardId === null) return;
      queryClient.setQueryData(["match", match.id], match);
      navigate(`/play/${match.boardId}`);
    },
    onError: (err: unknown) => setError(messageFor(err, "Could not join that match.")),
  });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8">
      <Link
        to="/sudoku"
        className="mb-4 inline-flex min-h-12 items-center text-sm text-slate-400 hover:text-slate-200"
      >
        ← Modes
      </Link>

      <h1 className="mb-8 text-xl font-semibold tracking-tight sm:text-2xl">Sudoku multiplayer</h1>

      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-rose-950/60 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {live?.status === "waiting" ? (
        <WaitingRoom match={live} onCancel={() => setHosted(null)} />
      ) : (
        <>
          <section className="mb-8 rounded-2xl border border-slate-700 bg-slate-800/30 p-6">
            <div className="mb-4 flex items-center gap-3">
              <MultiplayerIcon size="sm" />
              <h2 className="text-base font-semibold text-slate-100">Start a race</h2>
            </div>
            <p className="mb-4 text-sm text-slate-400">
              You and your opponent get the same puzzle on your own boards. First to finish wins.
            </p>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((difficulty) => (
                <button
                  key={difficulty}
                  type="button"
                  onClick={() => create.mutate(difficulty)}
                  disabled={create.isPending}
                  className="btn-primary min-h-12 flex-1 px-5 py-3 capitalize disabled:opacity-60"
                >
                  {difficulty}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-800/30 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-100">Join a race</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (joinCode.trim()) join.mutate(joinCode.trim());
              }}
              className="flex flex-wrap gap-2"
            >
              <label htmlFor="joinCode" className="sr-only">
                Join code
              </label>
              <input
                id="joinCode"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Join code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                className="min-h-12 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 font-mono tracking-[0.3em] text-slate-100 placeholder:font-sans placeholder:tracking-normal"
              />
              <button
                type="submit"
                disabled={join.isPending || !joinCode.trim()}
                className="btn-primary min-h-12 px-6 py-3 disabled:opacity-60"
              >
                {join.isPending ? "Joining…" : "Join"}
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}

/** The host's wait. The code is the whole content — everything else is happening on the server. */
function WaitingRoom({ match, onCancel }: { match: MatchResponse; onCancel: () => void }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-10 text-center">
      <MultiplayerIcon size="lg" />
      <p className="text-sm text-slate-400">Share this code with your opponent</p>
      <p className="font-mono text-4xl font-semibold tracking-[0.4em] text-slate-100">
        {match.joinCode}
      </p>
      <p className="text-sm capitalize text-slate-400">{match.difficulty} · waiting for a player…</p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 min-h-12 px-4 py-3 text-sm text-slate-400 underline hover:text-slate-200"
      >
        Cancel
      </button>
    </section>
  );
}

/**
 * Turns a failed create/join into something worth reading. The server's own message is preferred
 * where it has one — "That match is full" beats anything generic — but 503 is special-cased,
 * because it means the board pool is momentarily empty rather than that the player did anything
 * wrong, and the match is still there to join.
 */
function messageFor(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 503) return "No puzzles ready just now — try again in a moment.";
    if (err.status === 404) return "No match with that code.";
    return err.message || fallback;
  }
  return fallback;
}
