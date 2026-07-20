import { TOTAL_CELLS, type MatchPlayer, type MatchResponse } from "../api/types";

/**
 * The race, as a pair of bars above the board.
 *
 * A player's position is their `correctCells` count and nothing else — the opponent's grid never
 * crosses the network, because most of a half-solved grid is the solution. The bar can move
 * *backwards* when someone erases a correct digit, which is honest and worth not smoothing away.
 */
export function MatchProgress({
  match,
  viewer,
  onForfeit,
  forfeitPending = false,
}: {
  match: MatchResponse;
  viewer: string | null;
  onForfeit: () => void;
  forfeitPending?: boolean;
}) {
  const me = match.players.find((p) => p.username === viewer) ?? null;
  const opponent = match.players.find((p) => p.username !== viewer) ?? null;

  if (!opponent) {
    return (
      <p className="mb-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-400">
        Waiting for an opponent…
      </p>
    );
  }

  const winner = match.winnerUserId;
  const outcome =
    match.status !== "finished" || !me
      ? null
      : winner === me.userId
        ? "You won"
        : `${opponent.username} won`;

  return (
    <section
      className="mb-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3"
      aria-label="Race progress"
    >
      {outcome && <p className="mb-2 text-sm font-semibold text-slate-100">{outcome}</p>}
      <ProgressRow player={me} label="You" highlight />
      <ProgressRow player={opponent} label={opponent.username} />

      {match.status === "active" && (
        <button
          type="button"
          onClick={onForfeit}
          disabled={forfeitPending}
          className="mt-2 min-h-12 w-full py-2 text-xs text-slate-500 underline hover:text-slate-300 disabled:opacity-60"
        >
          {forfeitPending ? "Giving up…" : "Give up"}
        </button>
      )}
    </section>
  );
}

function ProgressRow({
  player,
  label,
  highlight = false,
}: {
  player: MatchPlayer | null;
  label: string;
  highlight?: boolean;
}) {
  const correct = player?.correctCells ?? 0;
  const percent = Math.round((correct / TOTAL_CELLS) * 100);

  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className={highlight ? "font-semibold text-slate-100" : "text-slate-300"}>
          {label}
        </span>
        <span className="tabular-nums text-slate-400">
          {correct}/{TOTAL_CELLS}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-700"
        role="progressbar"
        aria-label={`${label}: ${correct} of ${TOTAL_CELLS} cells correct`}
        aria-valuenow={correct}
        aria-valuemin={0}
        aria-valuemax={TOTAL_CELLS}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            highlight ? "bg-sky-400" : "bg-slate-400"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
