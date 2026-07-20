import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, newUsername, register, signIn, signUp } from "./helpers";

/**
 * Signed in means: on the home screen, with a game to start. Deliberately NOT "the username is on
 * screen" — the header hides it below the `sm` breakpoint, because keeping it wraps the title onto
 * two lines on a phone. Asserting on it would fail on mobile for a reason that has nothing to do
 * with authentication.
 */
const expectSignedIn = async (page: Page) => {
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
};

test.describe("authentication", () => {
  test("an anonymous visitor is sent to the login screen", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("registering signs you straight in", async ({ page }) => {
    await signUp(page);
    await expectSignedIn(page);
  });

  // The post-login landing is the game hub, not a game. Its Sudoku tile opens the mode picker, and
  // single player is the way into the game itself. Enter the way a real visitor does — at the root,
  // which bounces to /login — because the root bounce must NOT pin login back to "/".
  test("signing in lands on the game hub, which leads through modes into the game", async ({
    page,
  }) => {
    const username = await register(page); // lands on /games
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/games");
    await expect(page.getByRole("heading", { name: "Choose your game" })).toBeVisible();

    await page.getByRole("link", { name: "Sudoku" }).click();
    await expect(page).toHaveURL("/sudoku");
    await expect(page.getByRole("heading", { name: "Choose a mode" })).toBeVisible();

    await page.getByRole("link", { name: "Single player" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();

    // ...and back out through the mode picker to the games list.
    await page.getByRole("link", { name: "Modes" }).click();
    await expect(page).toHaveURL("/sudoku");
    await page.getByRole("link", { name: "Games" }).click();
    await expect(page).toHaveURL("/games");
    await expect(page.getByRole("heading", { name: "Choose your game" })).toBeVisible();
  });

  /**
   * The one that matters. The access token is deliberately never persisted, so after a reload
   * there is nothing in memory and nothing in storage. The session can only come back from the
   * HttpOnly refresh cookie, via a single POST /api/v1/refresh. If this passes, the whole auth
   * design is working.
   */
  test("the session survives a reload, restored from the refresh cookie", async ({ page }) => {
    await signUp(page);

    const refreshes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/v1/refresh")) refreshes.push(r.url());
    });

    await page.reload();

    await expectSignedIn(page);
    expect(refreshes).toHaveLength(1); // one refresh, not a storm
  });

  /**
   * A deep link to a route that is not an S3 object. The mode picker is the first client route
   * added since the service worker's precache and CloudFront's 403/404 → /index.html rewrite were
   * set up, so it is the case where a stale navigation fallback would surface: the boot has to come
   * from the SPA shell, not a 404 body, and then survive the auth bootstrap.
   */
  test("a deep link to /sudoku boots the router and keeps the session", async ({ page }) => {
    await register(page);

    await page.goto("/sudoku");
    await expect(page.getByRole("heading", { name: "Choose a mode" })).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL("/sudoku");
    await expect(page.getByRole("heading", { name: "Choose a mode" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Single player" })).toBeVisible();
  });

  // The only things we persist are the board mirror (for offline play) and a boolean "this browser
  // had a session" hint. Never the token: it would be handed to any XSS, and the HttpOnly refresh
  // cookie already does the job properly.
  test("the access token is never written to storage", async ({ page }) => {
    await signUp(page);

    const persisted = await page.evaluate(() => ({
      local: Object.entries(localStorage).map(([k, v]) => `${k}=${v}`),
      session: Object.keys(sessionStorage),
    }));

    expect(persisted.session).toEqual([]);
    for (const entry of persisted.local) {
      expect(entry).toMatch(/^mind-games:(board:\d+|had-session)=/);
      expect(entry).not.toMatch(/eyJ/); // a JWT would start with the base64 of {"alg"
    }
  });

  test("the refresh cookie is HttpOnly and scoped to the API", async ({ page, context }) => {
    await signUp(page);
    const cookie = (await context.cookies()).find((c) => c.name === "refresh_token");

    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.path).toBe("/api/v1");
  });

  test("signing out clears the session", async ({ page, context }) => {
    await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    const cookie = (await context.cookies()).find((c) => c.name === "refresh_token");
    expect(cookie?.value ?? "").toBe("");
  });

  test("you can sign back in", async ({ page }) => {
    const username = await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, username);
    await expectSignedIn(page);
  });

  // The backend strips the reason from its error bodies (server.error.include-message defaults to
  // `never`), so all that survives is {"error":"Unauthorized"}. We must not show the player that.
  test("a wrong password gives a human-readable error", async ({ page }) => {
    const username = await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.goto("/login");
    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toHaveText(/invalid username or password/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a duplicate username is reported, not swallowed", async ({ page }) => {
    const username = await signUp(page);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.goto("/register");
    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Email").fill(`${newUsername()}@example.com`);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("alert")).toHaveText(/already taken/i);
  });

  test("a protected route redirects when signed out", async ({ page }) => {
    await page.goto("/stats");
    await expect(page).toHaveURL(/\/login$/);
  });
});
