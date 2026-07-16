/** Marketing tiles under the login form: a preview of what Cortex Clash offers. */
export default function GamePreviewTiles() {
  return (
    <section className="flex w-full max-w-sm flex-col items-center gap-4">
      <h2 className="flex w-full items-center gap-3 text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-sky-500/40" />
        Sharpen your mind
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-sky-500/40" />
      </h2>

      <ul className="grid w-full grid-cols-2 gap-3">
        <li className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-center">
          <SudokuIcon />
          <span className="text-sm font-medium text-slate-100">Sudoku</span>
          <span className="text-xs text-slate-400">Classic number puzzles</span>
        </li>
        <li className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-4 text-center">
          <MoreGamesIcon />
          <span className="text-sm font-medium text-slate-100">More games</span>
          <span className="text-xs text-slate-400">Coming soon</span>
        </li>
      </ul>
    </section>
  );
}

function SudokuIcon() {
  const digits = ["5", "", "", "", "3", "", "", "", "8"];
  return (
    <div
      aria-hidden
      className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-sky-500/40 bg-sky-500/20"
    >
      {digits.map((d, i) => (
        <span
          key={i}
          className="grid h-6 w-6 place-items-center bg-slate-800 text-xs font-semibold text-sky-300"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function MoreGamesIcon() {
  return (
    <div
      aria-hidden
      className="grid h-[74px] w-[74px] place-items-center rounded-md border border-slate-600 bg-slate-800 text-2xl font-semibold text-slate-500"
    >
      +
    </div>
  );
}
