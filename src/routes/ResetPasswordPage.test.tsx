import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import ResetPasswordPage from "./ResetPasswordPage";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => navigate,
}));

const clearSession = vi.fn();
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ clearSession }),
}));

/**
 * The page reads the token from `window.location`, not from the router — it has to, because the
 * whole point is to then remove it from the real address bar with history.replaceState.
 */
const landOn = (search: string) => {
  window.history.replaceState(null, "", `/reset-password${search}`);
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  );

const fillAndSubmit = async (password: string, confirm = password) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: "Set new password" }));
};

beforeEach(() => {
  navigate.mockReset();
  clearSession.mockReset();
  vi.spyOn(api, "resetPassword").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("ResetPasswordPage", () => {
  // The security property this page exists to uphold. The raw token is the one credential that can
  // change the password, and a secret in a URL is a secret in the browser history, the back button,
  // a bookmark, and the Referer of everything the page loads next. Read it once, then strip it.
  it("strips the token from the address bar on arrival", () => {
    landOn("?token=raw-secret-token");
    renderPage();

    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain("raw-secret-token");
  });

  it("still holds the token in memory after stripping it, and submits it", async () => {
    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("a-long-enough-password");

    expect(api.resetPassword).toHaveBeenCalledWith("raw-secret-token", "a-long-enough-password");
  });

  it("routes to /login on success rather than signing the user in", async () => {
    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("a-long-enough-password");

    expect(navigate).toHaveBeenCalledWith(
      "/login",
      expect.objectContaining({ replace: true }),
    );
  });

  // Regression: a user who resets while still signed in on this device. The reset revokes every
  // session server-side, including this browser's — so if the client goes on believing it is
  // authenticated, /login bounces it to a home screen whose every API call is already dead. Caught
  // by the e2e suite against a real backend, which is the only place it is visible.
  it("drops the local session on success, because the server has already revoked it", async () => {
    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("a-long-enough-password");

    expect(clearSession).toHaveBeenCalled();
  });

  it("keeps the session when the reset failed", async () => {
    vi.mocked(api.resetPassword).mockRejectedValue(new ApiError(400, "nope"));

    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("a-long-enough-password");

    await screen.findByRole("alert");
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation without spending the token", async () => {
    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("a-long-enough-password", "a-different-password");

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a password below the policy minimum without spending the token", async () => {
    // The token is single use. Burning it on a password the server is certain to refuse would cost
    // the user another round through their inbox for no reason.
    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("short");

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a password above the policy maximum without spending the token", async () => {
    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("a".repeat(31));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at most 30 characters/i);
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  // The character rule has to survive submit, not just typing: onSubmit clears the inline warning
  // before it validates, so a password that never passed through the keystroke handler — pasted,
  // or autofilled — would otherwise reach a server certain to refuse it.
  it("rejects characters outside the policy set without spending the token", async () => {
    landOn("?token=raw-secret-token");
    renderPage();

    await fillAndSubmit("café-au-lait-password");

    expect(await screen.findByRole("alert")).toHaveTextContent(/alphanumeric characters/i);
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server's message when the link is dead", async () => {
    vi.mocked(api.resetPassword).mockRejectedValue(
      new ApiError(400, "This password reset link is invalid or has expired. Please request a new one."),
    );

    landOn("?token=used-token");
    renderPage();

    await fillAndSubmit("a-long-enough-password");

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or has expired/i);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("offers a way out when there is no token in the link at all", () => {
    landOn("");
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(/invalid or has expired/i);
    expect(screen.getByRole("link", { name: "Request a new link" })).toBeInTheDocument();
  });
});
