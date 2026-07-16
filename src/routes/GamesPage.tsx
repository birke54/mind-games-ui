import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { MoreGamesIcon, SudokuIcon } from "../components/GameIcons";

/**
 * The post-login landing: a game picker. Sudoku is the only game today, so its tile is a shortcut
 * to the Sudoku home ("/"); the second tile is a placeholder for what's coming.
 */
export default function GamesPage() {
  const { username, logout } = useAuth();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8">
      <header className="mb-12 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">
          Cortex Clash
        </h1>
        <nav className="flex items-baseline gap-4 text-sm whitespace-nowrap text-slate-400">
          <span className="hidden text-slate-400 sm:inline">{username}</span>
          <button onClick={() => void logout()} className="hover:text-slate-200">
            Sign out
          </button>
        </nav>
      </header>

      <h2 className="mb-4 text-sm font-medium tracking-wide text-slate-400 uppercase">
        Choose your game
      </h2>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <li>
          <Link
            to="/"
            className="flex h-full flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/60 p-8 text-center hover:border-sky-500 hover:bg-slate-800"
          >
            <SudokuIcon size="lg" />
            <span className="text-lg font-semibold text-slate-100">Sudoku</span>
            <span className="text-sm text-slate-400">Classic number puzzles</span>
          </Link>
        </li>
        <li>
          <div
            aria-disabled
            className="flex h-full flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center"
          >
            <MoreGamesIcon size="lg" />
            <span className="text-lg font-semibold text-slate-100">More games</span>
            <span className="text-sm text-slate-400">Coming soon</span>
          </div>
        </li>
      </ul>
    </main>
  );
}
