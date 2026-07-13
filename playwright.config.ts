import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a real backend — there is no mocking here, because the things most
 * worth testing (the refresh-cookie session bootstrap, board claiming, last-write-wins saving) are
 * exactly the things a mock would get wrong.
 *
 * Bring the API up first, then:  npm run test:e2e
 * See README.md for the two env vars the backend needs locally.
 */
const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:18081";

export default defineConfig({
  testDir: "./e2e",
  // Each spec claims boards from a shared, finite pool that refills on a 5-minute cron, so
  // hammering it in parallel just starves the tests of boards.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],

  // Generous, because a test may legitimately have to sit and wait for the board pool to refill —
  // a 503 from GET /board is documented behaviour, not a failure, and the refill runs on a cron.
  // The default 30s is shorter than one refill cycle, so tests would fail on an empty pool.
  timeout: 150_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      // iPhone 13's viewport, touch, device scale factor and user agent — but Chromium, not
      // WebKit. The descriptor defaults to WebKit, which needs system libraries installed as root
      // (`npx playwright install-deps webkit`); where they're missing it hangs on launch rather
      // than failing cleanly.
      //
      // Be clear about what this does and doesn't buy: it tests the responsive layout, the touch
      // targets and the number-pad flow. It does NOT test Safari's engine, which is where iOS
      // quirks actually live. Install the deps and drop the browserName override to get the real
      // thing in CI.
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],

  // The suite runs against the PRODUCTION BUILD, not the dev server. The service worker is
  // deliberately disabled in dev (a SW caching a dev bundle is a debugging trap), and without it
  // there is no offline shell — so `offline.spec.ts` could not pass against `npm run dev` no matter
  // how correct the app was. Testing the artifact that actually ships is the right answer anyway.
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    env: { VITE_API_TARGET: API_TARGET },
    timeout: 120_000,
  },
});
