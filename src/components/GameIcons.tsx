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
