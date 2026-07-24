import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";
import GamePreviewTiles from "../components/GamePreviewTiles";

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  // `notice` is set by ResetPasswordPage, which sends the user here rather than signing them in.
  const location = useLocation() as { state?: { from?: string; notice?: string } };
  const notice = location.state?.notice;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") {
    return <Navigate to={location.state?.from ?? "/games"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate(location.state?.from ?? "/games", { replace: true });
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
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="flex w-full flex-col items-center gap-8">
        {/* Equal 1fr side tracks keep the form centered on the page exactly as it was before the
            note existed — the note fills the left track and the right one stays empty. The centre
            track is 24rem to match the form's own max-w-sm. */}
        <div className="flex w-full flex-col items-center gap-6 md:grid md:grid-cols-[1fr_24rem_1fr] md:items-center md:gap-6">
          <form
            onSubmit={(e) => void onSubmit(e)}
            className="w-full max-w-sm space-y-4 md:col-start-2 md:row-start-1"
          >
            <h1 className="text-center text-3xl font-semibold tracking-tight">Cortex Clash</h1>

            {notice && (
              <p role="status" className="text-sm text-emerald-400">
                {notice}
              </p>
            )}

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
              <Link to="/forgot-password" className="text-sky-400 underline">
                Forgot password?
              </Link>
            </p>

            <p className="text-center text-sm text-slate-400">
              No account?{" "}
              <Link to="/register" className="text-sky-400 underline">
                Register
              </Link>
            </p>
          </form>

          {/* After the form in the DOM so the sign-in fields stay above the fold on phones and
              the h1 still leads the page; explicit grid placement moves it left on wider screens. */}
          <aside className="w-full max-w-sm space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-300 md:col-start-1 md:row-start-1 md:max-w-xs md:justify-self-end">
            <h2 className="text-lg font-semibold text-slate-100">
              Recruiter or prospective employer?
            </h2>
            <p>Sign in with the guest account to look around — no sign-up needed.</p>
            <p>
              Username: <span className="font-mono text-slate-100">recruiterguest</span>
              <br />
              Password: <span className="font-mono text-slate-100">recruiterguest</span>
            </p>
          </aside>
        </div>

        <GamePreviewTiles />
      </div>
    </main>
  );
}
