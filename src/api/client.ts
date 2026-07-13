/**
 * The single door to the API.
 *
 * Two things here are load-bearing, and both come from how the backend does auth:
 *
 *  - The access token lives in a module variable, never in localStorage. It is short-lived
 *    (15 min) and the HttpOnly refresh cookie is what actually survives a reload, so persisting
 *    the access token would buy nothing and hand it to any XSS.
 *
 *  - Refreshing is single-flight. The backend rotates the refresh token on every /refresh and
 *    treats a *reused* token as theft, revoking the entire token family. Two concurrent 401s
 *    firing two /refresh calls would do exactly that and log the user out. So all callers await
 *    one shared promise.
 */

import type {
  AuthenticateRequest,
  BoardResponse,
  Difficulty,
  RegisterRequest,
  SaveBoardProgress,
} from "./types";

/** The session ended and cannot be recovered without the login form. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

/**
 * The request never reached the server — offline, DNS, a dropped connection.
 *
 * Kept distinct from {@link SessionExpiredError} on purpose: **a failed request is not a failed
 * authentication.** Conflating them signs the player out the moment they walk into a tunnel, and
 * an app that can otherwise play offline would show them the login screen instead of their board.
 */
export class NetworkError extends Error {
  constructor() {
    super("Could not reach the server");
    this.name = "NetworkError";
  }
}

/** A non-2xx response from the API, carrying the status so callers can branch on it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;

/** Called when a refresh fails, so the auth layer can drop the user at /login. */
let onSessionExpired: () => void = () => {};

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * The username, read from the JWT's `sub` claim. Display only — the signature is never checked
 * here, and there is no /me endpoint to ask instead.
 */
export function currentUsername(): string | null {
  if (!accessToken) return null;
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { sub?: string };
    return claims.sub ?? null;
  } catch {
    return null;
  }
}

/**
 * Exchanges the refresh cookie for a fresh access token, rotating the cookie server-side.
 * Concurrent callers share one in-flight request — see the note at the top of this file.
 */
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    let res: Response;
    try {
      res = await fetch("/api/v1/refresh", { method: "POST", credentials: "include" });
    } catch {
      // Never reached the server. The refresh cookie is untouched and the session may well still
      // be good — we simply cannot tell right now, so say so rather than declaring it dead.
      throw new NetworkError();
    }
    if (!res.ok) {
      accessToken = null;
      throw new SessionExpiredError();
    }
    const { accessToken: token } = (await res.json()) as { accessToken: string };
    accessToken = token;
    return token;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Whether a status means "your credentials didn't get you in", and so is worth one refresh.
 *
 * 403 is in here for a non-obvious reason. `JwtAuthenticationFilter` catches the JwtException from
 * an expired or malformed token, clears the security context, and *continues the chain* — so the
 * request lands unauthenticated, and Spring Security (which has no AuthenticationEntryPoint
 * configured) answers 403, not 401. An expired access token therefore looks exactly like a
 * forbidden one. Refreshing only on 401 would mean the silent refresh never fires and every
 * session dies at the 15-minute token expiry. Verified against the running backend.
 *
 * Retrying is safe: the API has no roles, so there is no legitimate "authenticated but forbidden"
 * case to confuse this with.
 */
function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Public endpoints (register, authenticate) must not attempt a refresh on 401. */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const send = async (): Promise<Response> => {
    try {
      return await fetch(path, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new NetworkError();
    }
  };

  let res = await send();

  // One retry, and only for an authenticated call: the token expired mid-session, so mint a
  // new one and replay. Still rejected after a fresh token means the refresh cookie is gone too.
  if (isAuthFailure(res.status) && auth) {
    try {
      await refreshAccessToken();
    } catch (err) {
      // A network failure here says nothing about the session — don't sign the player out for it.
      if (err instanceof NetworkError) throw err;
      onSessionExpired();
      throw new SessionExpiredError();
    }
    res = await send();
    if (isAuthFailure(res.status)) {
      onSessionExpired();
      throw new SessionExpiredError();
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res, res.statusText));
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/* ---------------------------------------------------------------- auth */

export async function register(req: RegisterRequest): Promise<{ username: string }> {
  return request("/api/v1/register", { method: "POST", body: req, auth: false });
}

export async function authenticate(req: AuthenticateRequest): Promise<string> {
  const { accessToken: token } = await request<{ accessToken: string }>(
    "/api/v1/authenticate_user",
    { method: "POST", body: req, auth: false },
  );
  accessToken = token;
  return token;
}

export async function logout(): Promise<void> {
  try {
    await request<void>("/api/v1/logout", { method: "POST", auth: false });
  } finally {
    // The cookie is cleared server-side regardless; drop the token even if the call failed.
    accessToken = null;
  }
}

/* -------------------------------------------------------------- boards */

/** Claims a board from the pool. Throws ApiError(503) when that difficulty is empty. */
export async function claimBoard(difficulty: Difficulty): Promise<BoardResponse> {
  return request(`/api/v1/board?difficulty=${difficulty}`);
}

/** Every board the caller has ever touched, most recently played first. */
export async function listBoards(): Promise<BoardResponse[]> {
  return request("/api/v1/boards");
}

/** Throws ApiError(409) if the board is already completed — completion is terminal. */
export async function saveProgress(
  boardId: number,
  progress: SaveBoardProgress,
): Promise<BoardResponse> {
  return request(`/api/v1/boards/${boardId}`, { method: "PUT", body: progress });
}
