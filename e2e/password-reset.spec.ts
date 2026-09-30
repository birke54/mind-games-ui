import { expect, test } from "@playwright/test";
import {
  DOWN_SKIP,
  MAILPIT_URL,
  MAINTENANCE,
  PASSWORD,
  clearMailbox,
  mailpitRunning,
  messageCountFor,
  newUsername,
  signUp,
  waitForResetLink,
} from "./helpers";

/*
 * Every test below goes through an account, and the account screens are switched off while the
 * planned-downtime switch is on. Skip rather than fail: a red run here blocks the deploy that
 * ships the maintenance page. `maintenance.spec.ts` covers the build in that state.
 */
test.skip(() => MAINTENANCE !== null, DOWN_SKIP);

/**
 * The real flow, end to end, through a real mailbox.
 *
 * These specs need the Mailpit container that `e2e.yml` stands up beside MySQL and the backend. On
 * a laptop without one they skip rather than fail — but they are the point of the whole SMTP
 * decision, so CI must not skip them silently. `e2e.yml` asserts Mailpit is up before it runs the
 * suite.
 */
test.describe("password reset", () => {
  test.beforeEach(async () => {
    test.skip(!(await mailpitRunning()), `no Mailpit at ${MAILPIT_URL} — start one to run these`);
    await clearMailbox();
  });

  const NEW_PASSWORD = "a-brand-new-password";

  test("a user who forgot their password gets back in", async ({ page }) => {
    const username = await signUp(page);
    const email = `${username}@example.com`;

    // Sign out, so the reset is happening from where a locked-out user actually is.
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/login");

    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByPlaceholder("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/if that address has an account/i)).toBeVisible();

    // The raw token is not in the database — this is the only place it exists.
    const link = await waitForResetLink(email);
    await page.goto(link);

    // Landed from the email, and the secret is already out of the address bar.
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    expect(new URL(page.url()).search).toBe("");

    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set new password" }).click();

    // Sent to /login, not signed in: a reset proves control of an inbox, not intent to start a
    // session, and every device has just been signed out on purpose.
    await page.waitForURL("**/login");
    await expect(page.getByRole("status")).toContainText(/password has been reset/i);

    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // A fresh sign-in lands on the game hub — proof enough that the new password works.
    await page.waitForURL("/games", { timeout: 20_000 });
  });

  test("the old password stops working once the new one is set", async ({ page }) => {
    const username = await signUp(page);
    const email = `${username}@example.com`;

    await page.goto("/forgot-password");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await page.goto(await waitForResetLink(email));
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set new password" }).click();
    await page.waitForURL("**/login");

    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Password").fill(PASSWORD); // the password they signed up with
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toHaveText(/invalid username or password/i);
  });

  test("a link cannot be used twice", async ({ page }) => {
    const username = await signUp(page);
    const email = `${username}@example.com`;

    await page.goto("/forgot-password");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const link = await waitForResetLink(email);

    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set new password" }).click();
    await page.waitForURL("**/login");

    // Same link again. The token is single-use; `used_at` is set and it is dead.
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("yet-another-password");
    await page.getByLabel("Confirm new password", { exact: true }).fill("yet-another-password");
    await page.getByRole("button", { name: "Set new password" }).click();

    await expect(page.getByRole("alert")).toHaveText(/invalid or has expired/i);
  });

  test("requesting a reset for an unknown address says the same thing, and sends nothing", async ({
    page,
  }) => {
    // The two halves of not being a user-enumeration oracle: the screen must not give it away, and
    // no mail may go to a stranger's inbox.
    const stranger = `${newUsername("nobody")}@example.com`;

    await page.goto("/forgot-password");
    await page.getByPlaceholder("Email").fill(stranger);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText(/if that address has an account/i)).toBeVisible();
    expect(await messageCountFor(stranger)).toBe(0);
  });

  test("a mismatched confirmation is caught before the link is spent", async ({ page }) => {
    const username = await signUp(page);
    const email = `${username}@example.com`;

    await page.goto("/forgot-password");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const link = await waitForResetLink(email);

    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password", { exact: true }).fill("something-else-entirely");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert")).toHaveText(/do not match/i);

    // The token was never sent, so it is still good: fix the typo and it goes through.
    await page.getByLabel("Confirm new password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set new password" }).click();
    await page.waitForURL("**/login");
  });
});
