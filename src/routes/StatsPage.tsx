import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import * as api from "../api/client";
import { formatElapsed } from "../game/sudoku";
import { computeStats } from "../game/stats";

/**
 * Stats, folded out of the board list on the client — the backend has no stats endpoint and
 * doesn't need one.
 *
 * These are a handful of headline numbers, so they get a hero figure, a row of stat tiles, and a
 * table for the per-difficulty breakdown. A bar chart of three bars would be a chart for the sake
 * of having one.
 */
export default function StatsPage() {
  const boards = useQuery({ queryKey: ["boards"], queryFn: api.listBoards });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8">
      <header className="mb-10 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <Link to="/sudoku/solo" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back
        </Link>
      </header>

      {boards.isPending && <p className="text-slate-400">Loading…</p>}
      {boards.isError && <p className="text-rose-400">Could not load your boards.</p>}

      {boards.isSuccess && <Stats boards={boards.data} />}
    </main>
  );
}

function Stats({ boards }: { boards: Parameters<typeof computeStats>[0] }) {
  const stats = computeStats(boards);

  if (boards.length === 0) {
    return (
      <p className="text-slate-400">
        No boards yet.{" "}
        <Link to="/sudoku/solo" className="text-sky-400 underline">
          Play one
        </Link>{" "}
        and this fills in.
      </p>
    );
  }

  return (
    <>
      {/* The hero figure: the one number the page leads with. Proportional figures, not
          tabular — tabular-nums gives every digit the width of a 0, which looks loose at
          display sizes. Tabular is for the columns below, where digits must line up. */}
      <section className="mb-10">
        <p className="text-6xl font-semibold tracking-tight">{stats.solved}</p>
        <p className="mt-1 text-slate-400">
          {stats.solved === 1 ? "board solved" : "boards solved"}
        </p>
      </section>

      <section className="mb-10 grid grid-cols-3 gap-3" aria-label="Summary">
        <StatTile label="In progress" value={String(stats.inProgress)} />
        <StatTile
          label="Best solve"
          value={stats.bestSeconds === null ? "—" : formatElapsed(stats.bestSeconds)}
        />
        <StatTile label="Time played" value={formatElapsed(stats.totalSeconds)} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium tracking-wide text-slate-400 uppercase">
          By difficulty
        </h2>

        {/* Wide content scrolls inside its own box rather than the page scrolling sideways. */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-700">
                <th scope="col" className="py-2 font-medium">
                  Difficulty
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Solved
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Best
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Average
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.byDifficulty.map((row) => (
                <tr key={row.difficulty} className="border-b border-slate-800">
                  <th scope="row" className="py-3 font-normal text-slate-200 capitalize">
                    {row.difficulty}
                  </th>
                  <td className="py-3 text-right tabular-nums text-slate-300">{row.solved}</td>
                  <td className="py-3 text-right tabular-nums text-slate-300">
                    {row.bestSeconds === null ? "—" : formatElapsed(row.bestSeconds)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-slate-300">
                    {row.averageSeconds === null ? "—" : formatElapsed(row.averageSeconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
