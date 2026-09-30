import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import { EMAIL_MAX_LENGTH } from "../api/types";
import { maintenanceNotice } from "../maintenance";
import { MaintenanceBanner, MaintenanceDialog } from "../components/Maintenance";

export default function ForgotPasswordPage() {
  // The reset mail is sent by the same backend that is down, so promising a link we cannot send
  // would be the one thing this screen must never do.
  const maintenance = maintenanceNotice();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // The field and the button are already disabled during maintenance; this is the backstop for
    // submits that go around them.
    if (maintenance) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      // Nothing we can land in here depends on whether the address has an account — the server
      // answers 202 either way, and never tells us. So reporting these failures honestly leaks
      // nothing: a throttle is about this IP, a 500 is about the server, and a NetworkError never
      // arrived. What we must *not* do is claim a link is on its way when the request plainly
      // failed, leaving the user waiting for mail that is never coming.
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many requests. Wait a moment and try again.");
      } else if (err instanceof ApiError) {
        setError("Something went wrong. Please try again.");
      } else {
        setError("Could not reach the server.");
      }
      setBusy(false);
    }
  }

  // The neutral confirmation. It is deliberately the same words whether or not that address has an
  // account: `users.email` is UNIQUE, so a confirmed address is a confirmed account, and the
  // backend goes to some trouble not to reveal that. The client must not give it away instead.
  if (sent) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
          <p role="status" className="text-sm text-slate-400">
            If that address has an account, we’ve sent it a link to reset the password. The link
            expires in 30 minutes.
          </p>
          <Link to="/login" className="btn-primary inline-block w-full">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Reset your password</h1>

        {/* Not during maintenance: "we'll send you a link" is the one promise this screen cannot
            keep while the backend that sends the mail is down. */}
        {maintenance ? (
          <MaintenanceBanner until={maintenance.until}>
            Password resets are paused for maintenance.
          </MaintenanceBanner>
        ) : (
          <p className="text-center text-sm text-slate-400">
            Enter the email address on the account and we’ll send you a link.
          </p>
        )}

        <input
          className="field"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          maxLength={EMAIL_MAX_LENGTH}
          aria-label="Email"
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
          {busy ? "Sending…" : "Send reset link"}
        </button>

        <p className="text-center text-sm text-slate-400">
          Remembered it?{" "}
          <Link to="/login" className="text-sky-400 underline">
            Sign in
          </Link>
        </p>
      </form>

      {maintenance && <MaintenanceDialog until={maintenance.until} />}
    </main>
  );
}
