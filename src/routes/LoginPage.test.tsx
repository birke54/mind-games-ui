import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { AuthProvider } from "../auth/AuthProvider";
import { maintenanceNotice } from "../maintenance";
import LoginPage from "./LoginPage";

vi.mock("../maintenance", () => ({ maintenanceNotice: vi.fn() }));

const notice = vi.mocked(maintenanceNotice);

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  // Anonymous: no cookie to mint a token from, which is what puts the login screen on screen.
  vi.spyOn(api, "refreshAccessToken").mockRejectedValue(new api.SessionExpiredError());
  vi.spyOn(api, "authenticate").mockResolvedValue("token");
  vi.spyOn(api, "currentUsername").mockReturnValue("ada");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("LoginPage during maintenance", () => {
  beforeEach(() => {
    notice.mockReturnValue({ until: "October 5" });
  });

  it("announces the downtime and when it ends before the player types anything", async () => {
    renderPage();

    const dialog = await screen.findByRole("alertdialog", { name: "Down for maintenance" });
    expect(dialog).toHaveTextContent("October 5");
  });

  it("switches the form off, so there is nothing to submit", async () => {
    renderPage();

    expect(await screen.findByPlaceholderText("Username")).toBeDisabled();
    expect(screen.getByPlaceholderText("Password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  // The disabled button is the visible half. This is the other one: a password manager can fire a
  // submit on a form whose fields it filled, and that must not reach the server either.
  it("does not authenticate even if the form submits anyway", async () => {
    renderPage();

    const form = (await screen.findByPlaceholderText("Username")).closest("form");
    if (!form) throw new Error("the sign-in form is not on the page");
    fireEvent.submit(form);

    expect(api.authenticate).not.toHaveBeenCalled();
  });

  // Dismissing the dialog is not dismissing the outage; the page has to keep saying so.
  it("keeps the notice on the page after the dialog is dismissed", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText(/paused for maintenance/i)).toHaveTextContent("October 5");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});

describe("LoginPage when the site is up", () => {
  beforeEach(() => {
    notice.mockReturnValue(null);
  });

  it("shows no maintenance dialog and signs the player in", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.type(await screen.findByPlaceholderText("Username"), "grace");
    await user.type(screen.getByPlaceholderText("Password"), "hunter2password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(api.authenticate).toHaveBeenCalledWith({
      username: "grace",
      password: "hunter2password",
    });
  });
});
