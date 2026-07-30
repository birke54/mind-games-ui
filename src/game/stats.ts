/**
 * Player statistics, totalled by the backend and served by `GET /api/v1/board/stats`.
 *
 * They used to be a fold over the board list on the client, which no longer works: that list is
 * capped at the five most recent *unfinished* boards, so it cannot see a completed board at all.
 * The backend answers from one grouped aggregate instead, and everything below is a rename of the
 * wire shape into the one the page renders.
 */

import {
  DIFFICULTIES,
  type BoardResponse,
  type BoardStatsResponse,
  type Difficulty,
  type DifficultyBreakdown,
} from "../api/types";

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

/**
 * A tier the player has never touched. The backend fills those in with zeroes, but its own contract
 * documents them as absent rows — cheap to tolerate either, and a missing key would otherwise
 * render every figure on the page as NaN.
 */
const UNPLAYED: DifficultyBreakdown = {
  boardsSolved: 0,
  boardsInProgress: 0,
  bestTime: null,
  totalPlayTime: 0,
};

export function computeStats(stats: BoardStatsResponse): PlayerStats {
  const byDifficulty = DIFFICULTIES.map((difficulty) => {
    const tier = stats.statsByDifficulty[difficulty] ?? UNPLAYED;

    return {
      difficulty,
      solved: tier.boardsSolved,
      inProgress: tier.boardsInProgress,
      bestSeconds: tier.bestTime,
      // The tier's play time counts solved boards only, so this is a mean *solve* time.
      averageSeconds: tier.boardsSolved
        ? Math.round(tier.totalPlayTime / tier.boardsSolved)
        : null,
    };
  });

  return {
    solved: stats.boardsSolved,
    inProgress: byDifficulty.reduce((total, d) => total + d.inProgress, 0),
    totalSeconds: stats.totalPlayTime,
    bestSeconds: stats.bestCompletedTime,
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
