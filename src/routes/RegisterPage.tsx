import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_CHARACTER_ERROR,
  PASSWORD_MAX_LENGTH_BYTES,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  hasAllowedPasswordCharacters,
  passwordByteLength,
} from "../api/types";
import { useAuth } from "../auth/AuthProvider";

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handlePasswordInput(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setPassword(value);
    setError(hasAllowedPasswordCharacters(value) ? null : PASSWORD_CHARACTER_ERROR);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // The same policy the reset form enforces, because it is the same policy the backend enforces
    // on both (`PasswordPolicy`). A rule applied to only one path produces the absurdity of a
    // password you may register with but may not reset to.
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (passwordByteLength(password) > PASSWORD_MAX_LENGTH_BYTES) {
      setError(`Password must be at most ${PASSWORD_MAX_LENGTH_BYTES} characters.`);
      return;
    }
    // Re-checked here and not only while typing: the clear above wipes the inline warning, so
    // without this a pasted password of refused characters would go to the server unchallenged.
    if (!hasAllowedPasswordCharacters(password)) {
      setError(PASSWORD_CHARACTER_ERROR);
      return;
    }

    setBusy(true);
    try {
      await api.register({ username, email, password });
      // Register does not mint tokens, so sign in with the credentials we already have.
      await login(username, password);
      navigate("/games", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("That username or email is already taken.");
      } else if (err instanceof ApiError && err.status === 429) {
        // API Gateway throttles this route hard: 1 rps, burst 3.
        setError("Too many sign-ups right now. Try again in a few seconds.");
      } else if (err instanceof ApiError) {
        setError(err.message || "Could not create the account.");
      } else {
        setError("Could not reach the server.");
      }
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={(e) => void onSubmit(e)} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Create an account</h1>

        <input
          className="field"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          autoComplete="username"
          maxLength={USERNAME_MAX_LENGTH}
          required
        />
        <input
          className="field"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          autoComplete="email"
          maxLength={EMAIL_MAX_LENGTH}
          required
        />
        <input
          className="field"
          type="password"
          value={password}
          onChange={handlePasswordInput}
          placeholder="Password"
          autoComplete="new-password"
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
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link to="/login" className="text-sky-400 underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
