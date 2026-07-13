/** Wire types, mirrored from the backend's `api.responses` / `api.requests` records. */

export type Difficulty = "easy" | "moderate" | "hard";
export type BoardStatus = "in_progress" | "completed";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "moderate", "hard"];

/**
 * A board belonging to the player. The three grid strings are 81 chars, row-major
 * (index = row * 9 + col), with '0' for an empty cell.
 *
 * `puzzle` is the immutable deal, so cell i is a given iff `puzzle[i] !== "0"`.
 * `solution` really is sent to the client — validation and hints are therefore local.
 */
export interface BoardResponse {
  id: number;
  difficulty: Difficulty;
  status: BoardStatus;
  puzzle: string;
  currentState: string;
  solution: string;
  /** Pencil marks keyed by row-major cell index ("0".."80"); cells without notes are absent. */
  notes: Record<string, number[]>;
  elapsedSeconds: number;
  claimedAt: string;
  completedAt: string | null;
  lastModifiedAt: string;
}

/** The whole state is sent on every save; the server applies no deltas. */
export interface SaveBoardProgress {
  currentState: string;
  notes: Record<string, number[]>;
  elapsedSeconds: number;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email: string;
}

export interface AuthenticateRequest {
  username: string;
  password: string;
}

/** Server-side field limits, from `User.USERNAME_MAX_LENGTH` / `EMAIL_MAX_LENGTH`. */
export const USERNAME_MAX_LENGTH = 25;
export const EMAIL_MAX_LENGTH = 50;
