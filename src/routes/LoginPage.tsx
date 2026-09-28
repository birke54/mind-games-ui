import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/client";
import { maintenanceNotice } from "../maintenance";
import GamePreviewTiles from "../components/GamePreviewTiles";

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  // `notice` is set by ResetPasswordPage, which sends the user here rather than signing them in.
  const location = useLocation() as { state?: { from?: string; notice?: string } };
  const notice = location.state?.notice;

  const maintenance = maintenanceNotice();
  const [dialogOpen, setDialogOpen] = useState(maintenance !== null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") {
    return <Navigate to={location.state?.from ?? "/games"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // The fields and the button are already disabled during maintenance; this is the backstop for
    // the submit paths that go around them — a password manager, or a stale tab left open when the
    // window closed.
    if (maintenance) return;
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

            {/* Outlives the dialog, so a dismissed player is never left with a dead form and
                nothing on screen saying why. */}
            {maintenance && (
              <p
                role="status"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              >
                Sign-in is paused for maintenance. We expect to be back on {maintenance.until}.
              </p>
            )}

            <input
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              maxLength={25}
              disabled={maintenance !== null}
              required
            />
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={maintenance !== null}
              required
            />

            {error && (
              <p role="alert" className="text-sm text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || maintenance !== null}
              className="btn-primary w-full"
            >
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
            <p>
              {maintenance
                ? "The guest account is yours to use as soon as maintenance is over — no sign-up needed."
                : "Sign in with the guest account to look around — no sign-up needed."}
            </p>
            <p>
              Username: <span className="font-mono text-slate-100">recruiterguest</span>
              <br />
              Password: <span className="font-mono text-slate-100">recruiterguest</span>
            </p>
          </aside>
        </div>

        <GamePreviewTiles />
      </div>

      {maintenance && dialogOpen && (
        <MaintenanceDialog until={maintenance.until} onDismiss={() => setDialogOpen(false)} />
      )}
    </main>
  );
}

/**
 * Says up front what a disabled form on its own cannot: sign-in is off on purpose, and until when.
 * Dismissible, because the rest of the screen — the game previews, the guest credentials — is still
 * worth reading, and the banner in the form keeps the message on the page afterwards.
 */
function MaintenanceDialog({ until, onDismiss }: { until: string; onDismiss: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-body"
      className="fixed inset-0 z-10 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 id="maintenance-title" className="mb-2 text-lg font-semibold">
          Down for maintenance
        </h2>
        <p id="maintenance-body" className="mb-6 text-sm leading-relaxed text-slate-300">
          We&apos;re doing some work on Cortex Clash, so signing in is switched off for now. We
          expect to be back up by {until}. Thanks for your patience.
        </p>
        <button type="button" autoFocus onClick={onDismiss} className="btn-primary w-full">
          Got it
        </button>
      </div>
    </div>
  );
}
