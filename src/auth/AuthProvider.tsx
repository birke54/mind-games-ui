import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as api from "../api/client";
import { NetworkError } from "../api/client";

/**
 * - `bootstrapping` — asking the server whether the refresh cookie is still good.
 * - `authenticated` — it was.
 * - `anonymous` — it wasn't, or there never was one. The login screen.
 * - `offline` — we couldn't ask. See below.
 */
type Status = "bootstrapping" | "authenticated" | "anonymous" | "offline";

interface AuthContextValue {
  status: Status;
  username: string | null;
  offline: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Remembers that this browser had a session, so an offline reload can tell "signed in, but I can't
 * reach the server" from "never signed in". It is not a credential — the actual credential is the
 * HttpOnly cookie, which JS cannot read — just a hint about which screen to show. Forging it buys
 * nothing: every API call still needs a token this flag cannot mint.
 */
const HAD_SESSION_KEY = "mind-games:had-session";

const rememberSession = (had: boolean) => {
  try {
    if (had) localStorage.setItem(HAD_SESSION_KEY, "1");
    else localStorage.removeItem(HAD_SESSION_KEY);
  } catch {
    /* private mode, quota — the app still works, it just can't play offline as well */
  }
};

const hadSession = (): boolean => {
  try {
    return localStorage.getItem(HAD_SESSION_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Owns the session.
 *
 * The access token is deliberately never persisted, so on a cold load we don't know whether the
 * user is signed in — we ask. A single POST /api/v1/refresh either mints a token from the HttpOnly
 * cookie (signed in, the cookie survived the reload) or 401s (not signed in). That call *is* the
 * session bootstrap; there is no other way to restore one.
 *
 * But that call needs a network, and this app is meant to be playable without one. If the refresh
 * fails *because the request never landed*, the session hasn't ended — we just can't confirm it.
 * Signing the player out for that would mean walking into a tunnel logs you out and hides the board
 * you're in the middle of, which is exactly what the offline mirror exists to prevent. So a network
 * failure lands in `offline`, where a player who had a session keeps playing from local state, and
 * we upgrade to `authenticated` the moment the network returns.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("bootstrapping");
  const [username, setUsername] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      await api.refreshAccessToken();
      setUsername(api.currentUsername());
      setStatus("authenticated");
      rememberSession(true);
    } catch (err) {
      if (err instanceof NetworkError && hadSession()) {
        // Signed in as far as we know, just unreachable. Let them play.
        setStatus("offline");
      } else {
        rememberSession(false);
        setStatus("anonymous");
      }
    }
  }, []);

  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      rememberSession(false);
      setUsername(null);
      setStatus("anonymous");
    });
    void bootstrap();
  }, [bootstrap]);

  // Coming back online is the cue to try the bootstrap we couldn't do before.
  useEffect(() => {
    const onOnline = () => {
      if (status === "offline") void bootstrap();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status, bootstrap]);

  const login = useCallback(async (user: string, password: string) => {
    await api.authenticate({ username: user, password });
    setUsername(api.currentUsername() ?? user);
    setStatus("authenticated");
    rememberSession(true);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    rememberSession(false);
    setUsername(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({ status, username, offline: status === "offline", login, logout }),
    [status, username, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}

/**
 * Route guard. Holds the render until the bootstrap settles, so a signed-in user reloading on
 * /play/42 isn't bounced to the login screen for a frame — and lets an offline player through,
 * because their board is on this device and the login screen could not help them anyway.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "bootstrapping") {
    return (
      <div className="grid min-h-dvh place-items-center text-slate-400">
        <span className="animate-pulse">Loading…</span>
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
