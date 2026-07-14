import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import { PASSWORD_MAX_LENGTH_BYTES, PASSWORD_MIN_LENGTH, passwordByteLength } from "../api/types";
import { useAuth } from "../auth/AuthProvider";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  // Read the token exactly once, during the first render, and hold it in memory for the lifetime
  // of the page. The effect below then takes it out of the URL — so this must capture it *before*
  // that runs, which a lazy initializer does.
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * Strip the token from the address bar immediately.
   *
   * A secret in a URL is a secret in the browser's history, in the back button, in a bookmark, in
   * whatever the user pastes when they ask for help, and in the `Referer` header of every request
   * the page subsequently makes. The token is single-use and short-lived, but "short-lived" is 30
   * minutes and the history entry is forever. Read it once, then take it out of the URL.
   *
   * replaceState rather than a redirect: it rewrites the current history entry in place, so there
   * is no entry left holding the token for the back button to return to.
   */
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Landed here with no token at all — a truncated link, or someone typing the route in. Say the
  // same thing the server says about a bad token, and offer the only useful next step.
  if (!token) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">This link is not valid</h1>
          <p role="alert" className="text-sm text-slate-400">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link to="/forgot-password" className="btn-primary inline-block w-full">
            Request a new link
          </Link>
        </div>
      </main>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Enforce the same policy the server will, so a rejectable password costs a round trip and a
    // burnt token rather than being discovered after the fact. The server is still the authority;
    // this is only about not wasting the user's single-use link on a mistake we can see from here.
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (passwordByteLength(password) > PASSWORD_MAX_LENGTH_BYTES) {
      setError(`Password must be at most ${PASSWORD_MAX_LENGTH_BYTES} bytes.`);
      return;
    }

    setBusy(true);
    try {
      await api.resetPassword(token, password);

      // "Every device" includes this one. The reset just revoked every refresh-token family the
      // user has, so whatever session this browser thought it had is already dead server-side —
      // drop it here too, or /login sees a still-"authenticated" user and bounces them to a home
      // screen whose every call is about to fail.
      clearSession();

      // Straight to /login, not into a session: a reset proves control of an inbox, not intent to
      // start one — and every device has just been signed out on purpose. `replace` so the back
      // button cannot return to a form whose token is now spent.
      navigate("/login", {
        replace: true,
        state: { notice: "Your password has been reset. Sign in with your new password." },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Wait a moment and try again.");
      } else if (err instanceof ApiError) {
        // The server's own message, which is the one worth showing: it distinguishes a dead link
        // ("request a new one") from a rejected password ("pick a better one"), because the user
        // does something different about each.
        setError(err.message || "This password reset link is invalid or has expired.");
      } else {
        setError("Could not reach the server.");
      }
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Choose a new password</h1>

        <input
          className="field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          aria-label="New password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <input
          className="field"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          autoComplete="new-password"
          aria-label="Confirm new password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />

        <p className="text-sm text-slate-400">
          At least {PASSWORD_MIN_LENGTH} characters.
        </p>

        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </main>
  );
}
