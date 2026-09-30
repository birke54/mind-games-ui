import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import { AuthProvider } from "../auth/AuthProvider";
import { maintenanceNotice } from "../maintenance";
import RegisterPage from "./RegisterPage";

vi.mock("../maintenance", () => ({ maintenanceNotice: vi.fn() }));

const notice = vi.mocked(maintenanceNotice);

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.spyOn(api, "refreshAccessToken").mockRejectedValue(new api.SessionExpiredError());
  vi.spyOn(api, "register").mockResolvedValue({ username: "grace" });
  vi.spyOn(api, "authenticate").mockResolvedValue("token");
  vi.spyOn(api, "currentUsername").mockReturnValue("ada");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("RegisterPage during maintenance", () => {
  beforeEach(() => {
    notice.mockReturnValue({ until: "October 5" });
  });

  it("says sign-ups are paused and switches the form off", async () => {
    renderPage();

    expect(await screen.findByRole("alertdialog", { name: "Down for maintenance" })).toBeVisible();
    expect(screen.getByText(/sign-ups are paused/i)).toHaveTextContent("October 5");
    expect(screen.getByPlaceholderText("Username")).toBeDisabled();
    expect(screen.getByPlaceholderText("Email")).toBeDisabled();
    expect(screen.getByPlaceholderText("Password")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  it("creates no account even if the form submits anyway", async () => {
    renderPage();

    const form = screen.getByPlaceholderText("Username").closest("form");
    if (!form) throw new Error("the sign-up form is not on the page");
    fireEvent.submit(form);

    expect(api.register).not.toHaveBeenCalled();
  });
});

describe("RegisterPage when the site is up", () => {
  beforeEach(() => {
    notice.mockReturnValue(null);
  });

  it("registers and signs the new account straight in", async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "grace" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "grace@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "hunter2password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(api.register).toHaveBeenCalledWith({
      username: "grace",
      email: "grace@example.com",
      password: "hunter2password",
    });
  });
});
