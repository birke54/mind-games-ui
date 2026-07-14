import { expect, type Page } from "@playwright/test";

export const PASSWORD = "hunter2password";

/** A fresh account per test, so tests never fight over one player's boards. */
export function newUsername(prefix = "e2e"): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export async function signUp(page: Page, username = newUsername()): Promise<string> {
  await page.goto("/register");
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Email").fill(`${username}@example.com`);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/", { timeout: 20_000 });
  return username;
}

export async function signIn(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/", { timeout: 20_000 });
}

export interface Board {
  id: number;
  puzzle: string;
  solution: string;
  currentState: string;
  difficulty: string;
}

/**
 * Claims a board and returns the BoardResponse read off the wire — the tests need the solution to
 * drive the game.
 *
 * A 503 means the pool for that difficulty is empty, which is documented, expected behaviour: a
 * @Scheduled job refills it every five minutes. So we wait it out rather than failing.
 */
export async function claimBoard(page: Page, difficulty = "Easy"): Promise<Board> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = page.waitForResponse((r) => r.url().includes("/api/v1/board?"), {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: difficulty }).click();
    const res = await response;

    if (res.status() === 200) {
      const board = (await res.json()) as Board;
      await page.waitForURL("**/play/**", { timeout: 20_000 });
      await expect(page.getByRole("grid")).toBeVisible();
      return board;
    }
    await page.waitForTimeout(15_000);
  }
  throw new Error("the board pool never refilled");
}

export const cell = (page: Page, index: number) => page.getByRole("gridcell").nth(index);

/**
 * Blocks until the service worker has precached the shell and taken control.
 *
 * Without this, going offline immediately after load is a race: the SW may not be active yet, and
 * the next navigation gets ERR_INTERNET_DISCONNECTED rather than the cached shell — a flaky test
 * that looks like a broken app.
 */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller !== null,
    undefined,
    { timeout: 30_000 },
  );
}

/** Row-major indices of the cells the player has to fill. */
export const emptyCells = (board: Board): number[] =>
  [...board.puzzle].flatMap((c, i) => (c === "0" ? [i] : []));

/* ------------------------------------------------------------------ mail */

/**
 * Mailpit, the SMTP sink the backend sends through in CI.
 *
 * This is the whole reason the backend speaks SMTP rather than using the SES SDK. The reset token
 * is stored as `sha256(raw)` and the raw value is *never persisted* — so it exists in exactly one
 * place in the universe, the email. Without a mailbox to read, the happy path (request a reset,
 * follow the link, set a password, sign in) is untestable end to end, and the most
 * security-sensitive flow in the app would have coverage on its failure cases only.
 */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

/** Whether a mail sink is actually there. Lets the mail specs skip on a laptop without one. */
export async function mailpitRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${MAILPIT_URL}/api/v1/info`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Empty the mailbox, so a test reads its own message and not one left by the last test. */
export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}

interface MailpitSummary {
  messages: { ID: string; To: { Address: string }[] }[];
}

/**
 * Polls the mailbox for the reset mail sent to `email` and returns the link out of its body.
 *
 * The mail is dispatched off the request thread (the backend answers 202 before SMTP is done), so
 * it is not there the instant the button is clicked — poll rather than assume.
 */
export async function waitForResetLink(email: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const list = (await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json()) as MailpitSummary;
    const message = list.messages.find((m) =>
      m.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
    );

    if (message) {
      const body = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)
      ).json()) as { Text: string; HTML: string };

      const link = /https?:\/\/\S*?\/reset-password\?token=[\w-]+/.exec(
        `${body.Text}\n${body.HTML}`,
      );
      if (!link) throw new Error(`reset mail to ${email} carried no reset link`);
      return link[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no reset mail arrived for ${email} within ${timeoutMs}ms`);
}

/** How many messages are sitting in the mailbox for an address. */
export async function messageCountFor(email: string): Promise<number> {
  const list = (await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json()) as MailpitSummary;
  return list.messages.filter((m) =>
    m.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
  ).length;
}
