import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { ApiError } from "../api/client";
import ForgotPasswordPage from "./ForgotPasswordPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );

const submit = async (email = "someone@example.com") => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
};

beforeEach(() => {
  vi.spyOn(api, "requestPasswordReset").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ForgotPasswordPage", () => {
  it("shows the neutral confirmation after a request", async () => {
    renderPage();
    await submit();

    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument();
  });

  // The point of the whole endpoint. The server answers 202 for a registered address and an
  // unregistered one alike, precisely so that neither can be told apart — and `users.email` is
  // UNIQUE, so a confirmed address is a confirmed account. If the client rendered anything
  // different for the two, it would hand back the user-enumeration oracle the backend just
  // refused to be.
  it("says exactly the same thing for an address with no account", async () => {
    renderPage();
    await submit("registered@example.com");
    const forRegistered = (await screen.findByRole("status")).textContent;

    cleanup();

    renderPage();
    await submit("nobody@example.com");
    const forUnknown = (await screen.findByRole("status")).textContent;

    expect(forUnknown).toBe(forRegistered);
  });

  it("reports a throttle honestly rather than claiming mail is on its way", async () => {
    // A 429 is about this IP, not about whether the account exists, so saying so leaks nothing —
    // and telling the user a link is coming when the request never got through would leave them
    // waiting for mail that is never sent.
    vi.mocked(api.requestPasswordReset).mockRejectedValue(new ApiError(429, "Too Many Requests"));

    renderPage();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many requests/i);
    expect(screen.queryByText(/if that address has an account/i)).not.toBeInTheDocument();
  });

  it("does not claim success when the server could not be reached", async () => {
    vi.mocked(api.requestPasswordReset).mockRejectedValue(new api.NetworkError());

    renderPage();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    expect(screen.queryByText(/if that address has an account/i)).not.toBeInTheDocument();
  });
});
