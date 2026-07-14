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

export interface RequestPasswordResetRequest {
  email: string;
}

export interface ResetPasswordRequest {
  /** The raw token from the emailed link. Never persisted anywhere — see ResetPasswordPage. */
  token: string;
  password: string;
}

/** Server-side field limits, from `User.USERNAME_MAX_LENGTH` / `EMAIL_MAX_LENGTH`. */
export const USERNAME_MAX_LENGTH = 25;
export const EMAIL_MAX_LENGTH = 50;

/**
 * The password policy, from the backend's `PasswordPolicy`. Registration and reset are judged by
 * the same rule there, so both forms here enforce the same rule — a password you may register with
 * is a password you may reset to.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Maximum password length, **in bytes of UTF-8**, from `PasswordPolicy.MAX_LENGTH_BYTES`.
 *
 * Not characters: BCrypt silently truncates at 72 bytes, so the backend counts bytes and rejects
 * rather than quietly ignoring the tail. A 40-character password of emoji is over the limit, which
 * is why this cannot be an `maxLength` attribute on the input — see {@link passwordByteLength}.
 */
export const PASSWORD_MAX_LENGTH_BYTES = 72;

/** The length the backend will measure this password at. */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}
