import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") {
    return <Navigate to={location.state?.from ?? "/"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate(location.state?.from ?? "/", { replace: true });
    } catch (err) {
      // The backend throws ResponseStatusException(401, reason), but Spring's
      // server.error.include-message defaults to `never`, so the reason is stripped from the
      // body and all that survives is `"error": "Unauthorized"`. Showing that to a player is
      // useless, so we write our own copy. It also means a locked-out account (after
      // SECURITY_LOCKOUT_THRESHOLD failures) is indistinguishable from a wrong password here —
      // see DESIGN.md §8; fixing it needs a structured error body from the backend.
      // 429 is API Gateway throttling this route at 5 rps, not an auth failure.
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Wait a moment and try again.");
      } else if (err instanceof ApiError) {
        setError("Invalid username or password.");
      } else {
        setError("Could not reach the server.");
      }
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Cortex Clash</h1>

        <input
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          maxLength={25}
          required
        />
        <input
          className="field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
        />

        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-center text-sm text-slate-400">
          No account?{" "}
          <Link to="/register" className="text-sky-400 underline">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
