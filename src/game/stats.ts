/**
 * Player statistics, derived entirely on the client from `GET /api/v1/boards`.
 *
 * The backend has no stats endpoint, and doesn't need one: the board list already carries status,
 * difficulty and elapsed time for every board the player has ever touched. Everything below is a
 * fold over that list.
 */

import { DIFFICULTIES, type BoardResponse, type Difficulty } from "../api/types";

export interface DifficultyStats {
  difficulty: Difficulty;
  solved: number;
  inProgress: number;
  /** Fastest solve, in seconds. Null until one is solved. */
  bestSeconds: number | null;
  /** Mean solve time, in seconds. Null until one is solved. */
  averageSeconds: number | null;
}

export interface PlayerStats {
  solved: number;
  inProgress: number;
  /** Every second the player has spent, on solved and unfinished boards alike. */
  totalSeconds: number;
  /** Fastest solve at any difficulty. Null until one is solved. */
  bestSeconds: number | null;
  byDifficulty: DifficultyStats[];
}

export function computeStats(boards: readonly BoardResponse[]): PlayerStats {
  const byDifficulty = DIFFICULTIES.map((difficulty) => {
    const mine = boards.filter((b) => b.difficulty === difficulty);
    const solvedTimes = mine
      .filter((b) => b.status === "completed")
      .map((b) => b.elapsedSeconds);

    return {
      difficulty,
      solved: solvedTimes.length,
      inProgress: mine.filter((b) => b.status === "in_progress").length,
      bestSeconds: solvedTimes.length ? Math.min(...solvedTimes) : null,
      averageSeconds: solvedTimes.length
        ? Math.round(solvedTimes.reduce((a, b) => a + b, 0) / solvedTimes.length)
        : null,
    };
  });

  const bests = byDifficulty
    .map((d) => d.bestSeconds)
    .filter((s): s is number => s !== null);

  return {
    solved: byDifficulty.reduce((total, d) => total + d.solved, 0),
    inProgress: byDifficulty.reduce((total, d) => total + d.inProgress, 0),
    totalSeconds: boards.reduce((total, b) => total + b.elapsedSeconds, 0),
    bestSeconds: bests.length ? Math.min(...bests) : null,
    byDifficulty,
  };
}

/** How far into a board the player is, as a fraction of the cells they have to fill. */
export function progressOf(board: BoardResponse): number {
  let toFill = 0;
  let filled = 0;
  for (let i = 0; i < 81; i++) {
    if (board.puzzle[i] !== "0") continue; // a given: not the player's to fill
    toFill++;
    if (board.currentState[i] !== "0") filled++;
  }
  return toFill === 0 ? 1 : filled / toFill;
}

/** "just now" / "3 hours ago" / "2 days ago" — enough to pick a board back up by. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";

  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const MINUTE = 60;
  const HOUR = 3600;
  const DAY = 86400;
  const MONTH = 30 * DAY;

  if (seconds < HOUR) return format.format(-Math.round(seconds / MINUTE), "minute");
  if (seconds < DAY) return format.format(-Math.round(seconds / HOUR), "hour");
  if (seconds < MONTH) return format.format(-Math.round(seconds / DAY), "day");
  return format.format(-Math.round(seconds / MONTH), "month");
}
