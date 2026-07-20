import { Link } from "react-router-dom";
import { MultiplayerIcon } from "../components/GameIcons";

/** Placeholder: the backend has no multiplayer endpoints yet (DESIGN.md covers single player only). */
export default function MultiplayerPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8">
      <Link
        to="/sudoku"
        className="mb-4 inline-flex min-h-12 items-center text-sm text-slate-400 hover:text-slate-200"
      >
        ← Modes
      </Link>

      <h1 className="mb-10 text-xl font-semibold tracking-tight sm:text-2xl">
        Sudoku multiplayer
      </h1>

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-12 text-center">
        <MultiplayerIcon size="lg" />
        <p className="text-lg font-semibold text-slate-100">Coming soon</p>
        <p className="max-w-sm text-sm text-slate-400">
          Racing a friend through the same board is on the way. For now, take on a puzzle solo.
        </p>
        <Link to="/" className="btn-primary mt-2 px-6 py-3">
          Play single player
        </Link>
      </div>
    </main>
  );
}
