import { expect, test } from "@playwright/test";
import { DOWN_SKIP, MAINTENANCE, cell, claimBoard, emptyCells, signUp, waitForServiceWorker } from "./helpers";

/*
 * Every test below goes through an account, and the account screens are switched off while the
 * planned-downtime switch is on. Skip rather than fail: a red run here blocks the deploy that
 * ships the maintenance page. `maintenance.spec.ts` covers the build in that state.
 */
test.skip(() => MAINTENANCE !== null, DOWN_SKIP);

/**
 * The board's solution ships to the client, and every move is mirrored to localStorage. A claimed
 * board is therefore fully playable with no connectivity at all — the network save is best-effort
 * on top of local state, not a prerequisite for it.
 */
test.describe("offline play", () => {
  test("a board stays playable, and the moves survive a reload, with the network down", async ({
    page,
    context,
  }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first, second] = emptyCells(board);

    // Reloading offline only works because the service worker precached the shell. Wait for it to
    // take control before cutting the network, or we're just testing a race.
    await waitForServiceWorker(page);
    await context.setOffline(true);

    await cell(page, first).click();
    await page.keyboard.press(board.solution[first]);
    await expect(cell(page, first)).toHaveText(board.solution[first]);

    // The save fails, and the player is told where their work is — reassurance, not an error.
    await expect(page.getByText("Saved on this device")).toBeVisible({ timeout: 15_000 });

    // The mirror is what makes this survive the page dying — and it must hold the WHOLE board,
    // puzzle and solution included. Only the moves would not be enough: GET /boards is the only way
    // to fetch a board by id, and it cannot answer with the network down.
    const mirror = await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`mind-games:board:${id}`) ?? "null"),
      board.id,
    );
    expect(mirror.board.puzzle).toBe(board.puzzle);
    expect(mirror.board.solution).toBe(board.solution);
    expect(mirror.currentState[first]).toBe(board.solution[first]);

    await page.reload();
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(cell(page, first)).toHaveText(board.solution[first]);

    // Still playable while offline.
    await cell(page, second).click();
    await page.keyboard.press(board.solution[second]);
    await expect(cell(page, second)).toHaveText(board.solution[second]);
  });

  /**
   * A reload wipes the in-memory access token, and offline it cannot be replaced — POST /refresh
   * needs the network. The player must NOT be bounced to the login screen for that: a request that
   * never lands says nothing about whether the session is good, and the login screen could not help
   * them anyway. Then, on reconnect, everything has to catch up from nothing.
   */
  test("an offline reload keeps you signed in, and reconnecting catches everything up", async ({
    page,
    context,
  }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first] = emptyCells(board);

    await waitForServiceWorker(page);
    await context.setOffline(true);

    await cell(page, first).click();
    await page.keyboard.press(board.solution[first]);
    await expect(page.getByText("Saved on this device")).toBeVisible({ timeout: 15_000 });

    await page.reload();

    // Not the login screen.
    await expect(page).toHaveURL(/\/play\//);
    await expect(page.getByRole("grid")).toBeVisible();

    // Reconnect: the first PUT 403s (there is no token yet), which drives a refresh and a replay.
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" && r.url().includes("/api/v1/boards/") && r.status() === 200,
      { timeout: 25_000 },
    );
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await saved;

    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // It really landed on the server: drop the mirror and load fresh.
    await page.evaluate((id) => localStorage.removeItem(`mind-games:board:${id}`), board.id);
    await page.reload();
    await expect(cell(page, first)).toHaveText(board.solution[first]);
  });

  test("work done offline is pushed up when the network returns", async ({ page, context }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first] = emptyCells(board);

    await context.setOffline(true);
    await cell(page, first).click();
    await page.keyboard.press(board.solution[first]);
    await expect(page.getByText("Saved on this device")).toBeVisible({ timeout: 15_000 });

    // Coming back online must flush what piled up, without the player touching anything.
    //
    // Wait for a *successful* PUT, not merely the first one: if the access token expired while we
    // were away, the first attempt comes back 403, which triggers a refresh and a replay. That
    // 403 is the mechanism working, not a failure.
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" && r.url().includes("/api/v1/boards/") && r.status() === 200,
      { timeout: 25_000 },
    );
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await saved;
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // And it really landed: a fresh load from the server has the digit.
    await page.evaluate((id) => localStorage.removeItem(`mind-games:board:${id}`), board.id);
    await page.reload();
    await expect(cell(page, first)).toHaveText(board.solution[first]);
  });
});
