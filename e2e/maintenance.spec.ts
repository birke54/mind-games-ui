import { expect, test } from "@playwright/test";
import { MAINTENANCE, UP_SKIP } from "./helpers";

/**
 * The other side of the gate the account specs sit behind: while `src/maintenance.ts` returns a
 * notice, they skip and these run, so End-to-end always has something true to say about the build in
 * front of it. Off the switch goes, and this file skips itself instead.
 *
 * Nothing here needs the API. That is the point — every one of these screens must be honest about
 * the outage without asking the backend anything, since the backend is what is down.
 */
test.skip(() => MAINTENANCE === null, UP_SKIP);

const until = MAINTENANCE?.until ?? "";

test.describe("down for maintenance", () => {
  test("the login screen says so, and will not sign anyone in", async ({ page }) => {
    await page.goto("/login");

    const dialog = page.getByRole("alertdialog", { name: "Down for maintenance" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(until);

    await expect(page.getByPlaceholder("Username")).toBeDisabled();
    await expect(page.getByPlaceholder("Password")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();

    // Dismissing the dialog must not dismiss the explanation with it.
    await dialog.getByRole("button", { name: "Got it" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/sign-in is paused for maintenance/i)).toContainText(until);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  test("the login screen offers no way through to the other two", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("link", { name: "Register" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveCount(0);
    await expect(
      page.getByText(/creating an account and resetting a password are paused/i),
    ).toBeVisible();
  });

  test("the sign-up screen is switched off", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("alertdialog", { name: "Down for maintenance" })).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();

    await expect(page.getByText(/sign-ups are paused for maintenance/i)).toContainText(until);
    await expect(page.getByPlaceholder("Username")).toBeDisabled();
    await expect(page.getByPlaceholder("Email")).toBeDisabled();
    await expect(page.getByPlaceholder("Password")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  test("the reset screen is switched off, and promises no mail", async ({ page }) => {
    await page.goto("/forgot-password");

    await expect(page.getByRole("alertdialog", { name: "Down for maintenance" })).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();

    await expect(page.getByText(/password resets are paused for maintenance/i)).toContainText(until);
    await expect(page.getByLabel("Email")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeDisabled();
    // The one promise this screen cannot keep while the sender is down.
    await expect(page.getByText(/we’ll send you a link/i)).toHaveCount(0);
  });

  // The outage is not a way in: the guard still bounces an anonymous visitor to the login screen,
  // which is now the screen that explains why they can go no further.
  test("a guarded route still lands on the login screen", async ({ page }) => {
    await page.goto("/sudoku/solo");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("alertdialog", { name: "Down for maintenance" })).toBeVisible();
  });
});
