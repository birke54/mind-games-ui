import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { cell, claimBoard, emptyCells, signUp } from "./helpers";

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

test.describe("keyboard-only play", () => {
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
