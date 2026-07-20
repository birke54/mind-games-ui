/** Shared tile artwork, used at "sm" under the login form and "lg" on the game hub. */
type Size = "sm" | "lg";

export function SudokuIcon({ size = "sm" }: { size?: Size }) {
  const digits = ["5", "", "", "", "3", "", "", "", "8"];
  const cell = size === "lg" ? "h-10 w-10 text-base" : "h-6 w-6 text-xs";
  return (
    <div
      aria-hidden
      className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-sky-500/40 bg-sky-500/20"
    >
      {digits.map((d, i) => (
        <span
          key={i}
          className={`grid ${cell} place-items-center bg-slate-800 font-semibold text-sky-300`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

export function SinglePlayerIcon({ size = "sm" }: { size?: Size }) {
  const box = size === "lg" ? "h-[122px] w-[122px]" : "h-[74px] w-[74px]";
  return (
    <div
      aria-hidden
      className={`grid ${box} place-items-center rounded-md border border-sky-500/40 bg-sky-500/20`}
    >
      <Player className="w-1/2 text-sky-300" />
    </div>
  );
}

export function MultiplayerIcon({ size = "sm" }: { size?: Size }) {
  const box = size === "lg" ? "h-[122px] w-[122px]" : "h-[74px] w-[74px]";
  return (
    <div
      aria-hidden
      className={`flex ${box} items-center justify-center gap-1 rounded-md border border-slate-600 bg-slate-800`}
    >
      <Player className="w-2/5 text-slate-400" />
      <Player className="w-2/5 text-slate-500" />
    </div>
  );
}

function Player({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0z" />
    </svg>
  );
}

export function MoreGamesIcon({ size = "sm" }: { size?: Size }) {
  const box = size === "lg" ? "h-[122px] w-[122px] text-4xl" : "h-[74px] w-[74px] text-2xl";
  return (
    <div
      aria-hidden
      className={`grid ${box} place-items-center rounded-md border border-slate-600 bg-slate-800 font-semibold text-slate-500`}
    >
      +
    </div>
  );
}
