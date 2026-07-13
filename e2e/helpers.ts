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
