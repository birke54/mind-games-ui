import { expect, test } from "@playwright/test";
import { cell, claimBoard, conflictingEntry, emptyCells, signUp } from "./helpers";

test.describe("playing a board", () => {
  test("enter a digit, undo it, pencil a note", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first] = emptyCells(board);
    const right = board.solution[first];

    await cell(page, first).click();
    await page.keyboard.press(right);
    await expect(cell(page, first)).toHaveText(right);

    await page.keyboard.press("Control+z");
    await expect(cell(page, first)).toHaveText("");

    await page.keyboard.press("n"); // notes mode
    await page.keyboard.press("5");
    await expect(cell(page, first)).toHaveAttribute("aria-label", /notes 5/);
  });

  // A conflict is a digit repeated among a cell's peers, not a digit that disagrees with the
  // solution — so the entry has to be derived from the deal rather than from the answer key.
  test("a duplicate digit is flagged as a conflict", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const { index, digit } = conflictingEntry(board);

    await cell(page, index).click();
    await page.keyboard.press(digit);

    await expect(cell(page, index)).toHaveAttribute("aria-label", /conflict/);
  });

  /**
   * Key handling is bound to the window, not the grid. Bound to the grid, clicking any control
   * moves DOM focus onto that button and every keystroke afterwards goes nowhere — the player
   * clicks Notes, types a digit, and nothing happens.
   */
  test("the keyboard still works after clicking a control with the mouse", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first] = emptyCells(board);

    await cell(page, first).click();
    await page.getByRole("button", { name: "Notes" }).click(); // focus moves to the button
    await page.keyboard.press("7");

    await expect(cell(page, first)).toHaveAttribute("aria-label", /notes 7/);
  });

  test("a hint fills the right digit and can be undone", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first] = emptyCells(board);

    await cell(page, first).click();
    await page.keyboard.press("h");
    await expect(cell(page, first)).toHaveText(board.solution[first]);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(cell(page, first)).toHaveText("");
  });

  // Check is a one-shot, not a latch. Latched on, it would live-mark every wrong digit as it was
  // typed — a much easier game than the one the player asked for.
  test("check marks wrong digits, and the next edit retires the marks", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first, second] = emptyCells(board);
    const wrong = board.solution[first] === "9" ? "8" : "9";

    await cell(page, first).click();
    await page.keyboard.press(wrong);
    await expect(cell(page, first)).not.toHaveAttribute("aria-label", /incorrect/);

    await page.getByRole("button", { name: "Check" }).click();
    await expect(cell(page, first)).toHaveAttribute("aria-label", /incorrect/);

    // Edit a DIFFERENT cell: the wrong digit is still sitting in `first`, so if the mark survived
    // it would still be on it.
    await cell(page, second).click();
    await page.keyboard.press("1");
    await expect(cell(page, first)).not.toHaveAttribute("aria-label", /incorrect/);
  });

  test("progress autosaves and survives a reload", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first] = emptyCells(board);
    const right = board.solution[first];

    await cell(page, first).click();
    await page.keyboard.press(right);

    const put = await page.waitForResponse(
      (r) => r.request().method() === "PUT" && r.url().includes("/api/v1/boards/"),
      { timeout: 15_000 },
    );
    expect(put.status()).toBe(200);
    await expect(page.getByText("Saved")).toBeVisible();

    await page.reload();
    await expect(cell(page, first)).toHaveText(right);
  });

  test("the clock runs, and pausing hides the board and stops it", async ({ page }) => {
    await signUp(page);
    await claimBoard(page);

    const clock = page.locator("header span.tabular-nums");
    await expect(clock).toHaveText("0:00");
    await expect(clock).not.toHaveText("0:00", { timeout: 5_000 });

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Paused")).toBeVisible();

    const paused = await clock.textContent();
    await page.waitForTimeout(2_500);
    expect(await clock.textContent()).toBe(paused);
  });

  test("solving the board completes it, terminally", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);

    for (const index of emptyCells(board)) {
      await cell(page, index).click();
      await page.keyboard.press(board.solution[index]);
    }

    await expect(page.getByText("Solved", { exact: true })).toBeVisible({ timeout: 20_000 });

    // The server is the authority, and completion is terminal: the board freezes.
    const [first] = emptyCells(board);
    await expect(cell(page, first)).toHaveAttribute("aria-readonly", "true");

    await page.reload();
    await expect(page.getByText("Solved", { exact: true })).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Nothing on the go.")).toBeVisible();
  });

  test("the grid is square and fits the viewport", async ({ page }) => {
    await signUp(page);
    await claimBoard(page);

    const grid = await page.getByRole("grid").boundingBox();
    expect(Math.abs(grid!.width - grid!.height)).toBeLessThan(2);

    const viewport = page.viewportSize()!;
    expect(grid!.x + grid!.width).toBeLessThanOrEqual(viewport.width);

    // The page must never scroll sideways.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});

test.describe("the number pad", () => {
  // Cells are buttons, never <input>s: on iOS an input would raise the native keyboard and shove
  // the board off screen.
  test("tapping a cell focuses a button, not a text field", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    await cell(page, emptyCells(board)[0]).click();

    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BUTTON");
  });

  test("enters digits, and pencils them in notes mode", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first, second] = emptyCells(board);
    const pad = page.getByRole("group", { name: "Number pad" });

    // The pad greys out a spent digit, so use one the board still needs.
    const noteDigit = board.solution[second];
    await cell(page, second).click();
    await page.getByRole("button", { name: "Notes" }).click();
    await pad.getByRole("button", { name: `Enter ${noteDigit} as a note`, exact: true }).click();
    await expect(cell(page, second)).toHaveAttribute("aria-label", new RegExp(`notes ${noteDigit}`));

    await page.getByRole("button", { name: "Notes" }).click(); // back to digits
    await cell(page, first).click();
    await pad.getByRole("button", { name: `Enter ${board.solution[first]}`, exact: true }).click();
    await expect(cell(page, first)).toHaveText(board.solution[first]);
  });

  test("targets meet the 44px minimum", async ({ page }) => {
    await signUp(page);
    await claimBoard(page);

    const button = await page
      .getByRole("group", { name: "Number pad" })
      .getByRole("button")
      .first()
      .boundingBox();

    expect(button!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("stats", () => {
  test("counts a solved board and leaves unplayed difficulties blank", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);

    for (const index of emptyCells(board)) {
      await cell(page, index).click();
      await page.keyboard.press(board.solution[index]);
    }
    await expect(page.getByText("Solved", { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
    await expect(page.getByText("board solved")).toBeVisible();

    const easy = page.getByRole("row").filter({ hasText: "easy" });
    await expect(easy.getByRole("cell").first()).toHaveText("1");

    const hard = page.getByRole("row").filter({ hasText: "hard" });
    await expect(hard.getByRole("cell").nth(1)).toHaveText("—");
  });
});
