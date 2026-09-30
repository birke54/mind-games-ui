import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DOWN_SKIP, MAINTENANCE, cell, claimBoard, emptyCells, register, signUp } from "./helpers";

/** WCAG 2.1 A and AA. Run the audit; don't eyeball it. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe("accessibility", () => {
  test("the login screen", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations).toEqual([]);
  });

  test("the register screen", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations).toEqual([]);
  });

  test("the forgot-password screen", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations).toEqual([]);
  });

  test("the neutral confirmation", async ({ page }) => {
    // Reached only by submitting, which maintenance switches off.
    test.skip(MAINTENANCE !== null, DOWN_SKIP);

    // The confirmation replaces the form, so it is a screen of its own and axe never sees it
    // unless we submit. It is also the screen a user is most likely to be reading with a
    // screen reader, having just been told nothing specific happened.
    await page.goto("/forgot-password");
    await page.getByPlaceholder("Email").fill("someone@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/if that address has an account/i)).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations).toEqual([]);
  });

  test("the reset-password screen", async ({ page }) => {
    // A syntactically fine token that matches nothing. The form renders the same either way; it
    // only learns the token is dead on submit, which is what we want here — the form itself.
    await page.goto("/reset-password?token=not-a-real-token");
    await expect(page.getByRole("button", { name: "Set new password" })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations).toEqual([]);
  });

  test("the dead-link screen", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations).toEqual([]);
  });

  /*
   * These screens are behind an account, and no account can be reached while the planned-downtime
   * switch is on. The public audits above still run — and during maintenance they cover the
   * downtime dialog and banner, which is exactly when that copy is being read.
   */
  test.describe("signed in", () => {
    test.skip(() => MAINTENANCE !== null, DOWN_SKIP);

    test("the game hub", async ({ page }) => {
      await register(page); // lands on /games and stays there

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations).toEqual([]);
    });

    test("the sudoku mode picker", async ({ page }) => {
      await register(page);
      await page.getByRole("link", { name: "Sudoku" }).click();
      await expect(page.getByRole("heading", { name: "Choose a mode" })).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations).toEqual([]);
    });

    test("the multiplayer lobby", async ({ page }) => {
      await register(page);
      await page.getByRole("link", { name: "Sudoku" }).click();
      await page.getByRole("link", { name: "2-Player H2H" }).click();
      await expect(page.getByRole("heading", { name: "Sudoku multiplayer" })).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations).toEqual([]);
    });

    test("the home screen", async ({ page }) => {
      await signUp(page);

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations).toEqual([]);
    });

    test("the board", async ({ page }) => {
      await signUp(page);
      const board = await claimBoard(page);

      // Audit it with real content in it: a selection, a note, and a conflict.
      const [first, second] = emptyCells(board);
      await cell(page, first).click();
      await page.keyboard.press(board.solution[first] === "9" ? "8" : "9");
      await cell(page, second).click();
      await page.keyboard.press("n");
      await page.keyboard.press("3");

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations).toEqual([]);
    });

    test("the stats page", async ({ page }) => {
      await signUp(page);
      await claimBoard(page);
      await page.goto("/stats");
      await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations).toEqual([]);
    });
  });
});

test.describe("keyboard-only play", () => {
  test.skip(() => MAINTENANCE !== null, DOWN_SKIP);

  // The grid is one tab stop with roving focus — 81 tab stops would be unusable. A keyboard user
  // must be able to reach it and play without a mouse.
  test("the board is reachable and playable with the keyboard alone", async ({ page }) => {
    await signUp(page);
    const board = await claimBoard(page);
    const [first] = emptyCells(board);

    // Enter the grid, then drive it entirely with arrows and digits.
    await cell(page, first).click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press(board.solution[first]);

    await expect(cell(page, first)).toHaveText(board.solution[first]);
    await expect(cell(page, first)).toBeFocused();
  });
});
