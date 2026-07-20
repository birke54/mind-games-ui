/** Wire types, mirrored from the backend's `api.responses` / `api.requests` records. */

export type Difficulty = "easy" | "moderate" | "hard";
export type BoardStatus = "in_progress" | "completed";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "moderate", "hard"];

/**
 * A board belonging to the player. The grid strings are 81 chars, row-major
 * (index = row * 9 + col), with '0' for an empty cell.
 *
 * `puzzle` is the immutable deal, so cell i is a given iff `puzzle[i] !== "0"`.
 *
 * `solution` is sent for solo boards — validation and hints are therefore local — but is **null on
 * a match board** until the player finishes it. In a race, a solution sitting in the browser is a
 * win one paste away, so the server withholds it and the client has to do without: no live conflict
 * marking, and completion is predicted from a full grid rather than a matching one.
 */
export interface BoardResponse {
  id: number;
  difficulty: Difficulty;
  status: BoardStatus;
  puzzle: string;
  currentState: string;
  solution: string | null;
  /** The race this board belongs to, or null for ordinary solo play. */
  matchId: number | null;
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

/* ---------------------------------------------------------------- multiplayer */

export type MatchStatus = "waiting" | "active" | "finished" | "abandoned";

/** Cells in a grid — the denominator for a player's `correctCells` progress. */
export const TOTAL_CELLS = 81;

/**
 * One player's standing in a race.
 *
 * `correctCells` is the *whole* of what you learn about your opponent, and deliberately so: their
 * grid would be most of the solution. It is counted server-side against the solution, so a wrong
 * digit is not progress, and it can go down when they erase a correct one.
 */
export interface MatchPlayer {
  userId: number;
  username: string;
  correctCells: number;
  finishedAt: string | null;
}

/**
 * A race, as one of its two players sees it. This is what the lobby and the board poll.
 *
 * `status` drives the flow: "waiting" shows the join code, "active" means `boardId` is populated
 * and play can start, "finished" names a `winnerUserId`.
 */
export interface MatchResponse {
  id: number;
  joinCode: string;
  difficulty: Difficulty;
  status: MatchStatus;
  /** This player's board in the race; null while the lobby is still waiting. */
  boardId: number | null;
  hostUserId: number;
  winnerUserId: number | null;
  players: MatchPlayer[];
  startedAt: string | null;
  finishedAt: string | null;
}

/** A hint request. `cellIndex` is a preference — the server falls back to the first empty cell. */
export interface RevealHintRequest {
  cellIndex: number | null;
}

export interface CreateMatchRequest {
  difficulty: Difficulty;
}

export interface JoinMatchRequest {
  joinCode: string;
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
