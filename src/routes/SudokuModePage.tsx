import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { MultiplayerIcon, SinglePlayerIcon } from "../components/GameIcons";

/**
 * The mode picker that sits between the game hub and Sudoku itself. Single player is the existing
 * game at "/"; multiplayer is the two-player race lobby.
 */
export default function SudokuModePage() {
  const { username, logout } = useAuth();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8">
      <Link
        to="/games"
        className="mb-4 inline-flex min-h-12 items-center text-sm text-slate-400 hover:text-slate-200"
      >
        ← Games
      </Link>

      <header className="mb-12 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">
          Sudoku
        </h1>
        <nav className="flex items-baseline gap-4 text-sm whitespace-nowrap text-slate-400">
          <span className="hidden text-slate-400 sm:inline">{username}</span>
          <button onClick={() => void logout()} className="hover:text-slate-200">
            Sign out
          </button>
        </nav>
      </header>

      <h2 className="mb-4 text-sm font-medium tracking-wide text-slate-400 uppercase">
        Choose a mode
      </h2>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <li>
          <Link
            to="/sudoku/solo"
            className="flex h-full flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/60 p-8 text-center hover:border-sky-500 hover:bg-slate-800"
          >
            <SinglePlayerIcon size="lg" />
            <span className="text-lg font-semibold text-slate-100">Single player</span>
            <span className="text-sm text-slate-400">Solve at your own pace</span>
          </Link>
        </li>
        <li>
          <Link
            to="/sudoku/multiplayer"
            className="flex h-full flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/60 p-8 text-center hover:border-sky-500 hover:bg-slate-800"
          >
            <MultiplayerIcon size="lg" />
            <span className="text-lg font-semibold text-slate-100">2-Player H2H</span>
            <span className="text-sm text-slate-400">Race against your friends</span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
