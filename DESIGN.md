# mind-games-ui — design

A responsive React SPA for the `mind-games-backend` Sudoku service, serving desktop and mobile from
one codebase and one deployment.

This started as a plan and is now a description of what was built. Where a section explains *why*
something is the way it is, the reason is usually a constraint the backend imposes (§1) — and several
were found only by running the thing against a real API, not by reading the code.

---

## 1. What the backend actually gives us

Read from `mind-games-backend` (`ApiController`, `SecurityConfig`, `BoardResponse`, `PasswordResetService`,
`PasswordPolicy`, `V1__Initial_schema.sql`, `docs/aws-deployment.md`). This is the entire surface — there
is nothing else to call.

| Method | Path | Auth | Body / params | Success | Failures |
|---|---|---|---|---|---|
| GET | `/api/ping` | public | — | `{status:"ok"}` | — |
| POST | `/api/v1/register` | public | `{username, password, email}` | `201 {username}` | `409` duplicate, `500` |
| POST | `/api/v1/authenticate_user` | public | `{username, password}` | `200 {accessToken}` + `Set-Cookie` | `401` bad creds / locked out |
| POST | `/api/v1/refresh` | cookie | — | `200 {accessToken}` + rotated cookie | `401` (cookie cleared) |
| POST | `/api/v1/logout` | cookie | — | `204` + cookie cleared | — |
| POST | `/api/v1/request_password_reset` | public | `{email}` | `202`, empty body, **unconditionally** | — |
| POST | `/api/v1/reset_password` | public | `{token, password}` | `204`, no session started | `400 {error}` dead link *or* rejected password |
| GET | `/api/v1/board?difficulty=` | bearer | `easy\|moderate\|hard` | `200 BoardResponse` | `400` bad difficulty, `503` pool empty |
| GET | `/api/v1/boards` | bearer | — | `200 BoardResponse[]` (newest activity first) | — |
| PUT | `/api/v1/boards/{id}` | bearer | `{currentState, notes, elapsedSeconds}` | `200 BoardResponse` | `404` not yours, `409` already completed |

The password policy (`PasswordPolicy`) is **≥ 8 characters and ≤ 30 *bytes* of UTF-8**. The maximum
is still counted in bytes, but the backend now restricts passwords to 1-byte characters, so 30 bytes
is 30 characters and the forms say "characters". Register and reset are judged by the same rule, so
both forms enforce the same rule (`PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH_BYTES` in
`api/types.ts`). The byte limit is why the password field cannot simply carry a `maxLength`
attribute.

`BoardResponse`:

```ts
type BoardResponse = {
  id: number;
  difficulty: "easy" | "moderate" | "hard";
  status: "in_progress" | "completed";
  puzzle: string;        // 81 chars, row-major, '0' = empty. The immutable deal.
  currentState: string;  // 81 chars. Player's grid right now.
  solution: string;      // 81 chars. The completed grid — yes, the client gets it.
  notes: Record<string, number[]>;  // { "4": [1,5,9], "17": [2,3] } — cell index -> pencil marks
  elapsedSeconds: number;
  claimedAt: string;     // ISO instant
  completedAt: string | null;
  lastModifiedAt: string;
};
```

### The eight constraints that drive every decision below

1. **There is no CORS configuration anywhere in the backend.** Not in `SecurityConfig`, not in
   `application.yaml`. A cross-origin browser call with `Content-Type: application/json` triggers a
   preflight that will fail. **The front-end must be same-origin with the API, always.** In prod that
   is CloudFront (`/` → S3, `/api/*` → API Gateway); in dev it means a Vite proxy. Pointing the app
   straight at the `execute-api` URL fails twice over — no CORS, and `OriginVerificationFilter`
   returns `403` without CloudFront's `X-Origin-Verify` header.

2. **The refresh cookie is `HttpOnly; Secure; SameSite=Strict; Path=/api/v1`.** JS can never read it —
   that's correct and we lean on it. `SameSite=Strict` reinforces (1). Locally the backend must run
   with `COOKIE_SECURE=false` or the browser won't send it back over plain HTTP.

3. **Access tokens live 15 minutes** (`JWT_EXPIRATION_MINUTES`), subject = username, plus a `uid`
   claim. They are returned in the JSON body, so they live **in memory only** — never `localStorage`,
   which would hand them to any XSS. The refresh cookie is the durable credential.

4. **The solution ships to the client.** Validation, conflict highlighting, hints, and "check my work"
   are all local, instant, and work offline. No round trip for any of it. (It also means the game is
   trivially cheatable from devtools — see §8 if that ever matters.)

5. **Saves are full-state PUT with last-write-wins.** No ETag, no version column, no delta. Two devices
   on one account will silently clobber each other. This is the single biggest correctness risk for a
   "PC and mobile" product and §6 addresses it.

6. **`elapsedSeconds` is accumulated by the client** — the server never infers it from timestamps.
   Our timer is the source of truth, so it has to survive backgrounding on mobile.

7. **Completion is server-derived and terminal.** The save whose `currentState` first equals the
   solution comes back `status: "completed"` with `completedAt`; every later save on that board is
   `409`. The client can *predict* completion locally, but the server's response is the truth, and
   after it we stop accepting input and stop saving.

8. **`request_password_reset` is deliberately blind.** It answers `202` for a registered address, an
   unregistered one, and a string that is not an address at all — so that nobody can use it to
   discover whether an email has an account. The client must render the *same* confirmation in every
   case; a spinner that resolves differently would leak exactly what the API was careful to hide.
   (`reset_password`, by contrast, does distinguish "this link is no good" from "this password is
   unacceptable", because the user does something different about each.)

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite + React 18 + TypeScript** | Fast, static output drops straight into the S3 bucket CloudFront already fronts. |
| Routing | **React Router** | Handful of routes; deep-linkable `/play/:boardId`. |
| Server state | **TanStack Query** | Board list, claim, save-mutation retry/backoff for free. |
| Game state | **`useReducer` + a pure reducer** | Per-keystroke grid state must not go through the network cache. Pure reducer = trivially unit-testable and gives undo/redo for free. |
| Styling | **Tailwind + CSS custom properties** | Responsive-first utilities; CSS vars carry the light/dark theme. |
| Auth state | **React Context** | One token + username. Redux would be ceremony. |
| Tests | **Vitest + Testing Library**, **Playwright** | Reducer and sudoku helpers are pure — cheap, high-value unit tests. Playwright runs the golden path at a desktop *and* a mobile viewport. |

No Redux, no Zustand — three well-scoped state owners (auth context, query cache, game reducer) is
the whole app.

---

## 3. Structure

```
src/
  api/
    client.ts        # the one door to the API: bearer header, single-flight refresh, replay
    types.ts         # BoardResponse, Difficulty, … — mirrors the backend's records
  auth/
    AuthProvider.tsx # in-memory token, bootstrap-on-load, offline state, RequireAuth guard
  game/
    sudoku.ts        # pure: peers(i), conflicts(grid), mistakes(grid, solution), isSolved(…)
    gameReducer.ts   # pure: the game rules. SELECT | INPUT_DIGIT | ERASE | HINT | CHECK | UNDO | …
    stats.ts         # pure: folds GET /boards into the stats page and the resume list
    boardMirror.ts   # localStorage mirror + reconcile() — offline play and conflict detection
    useGameTimer.ts  # visibility-aware elapsed clock
    useAutosave.ts   # debounced PUT, flush on hide/pagehide/online
    useKeyboard.ts   # window-level key handling (see §4)
  components/
    Board.tsx  Cell.tsx  NumberPad.tsx  Controls.tsx
    GameIcons.tsx  GamePreviewTiles.tsx    # tile artwork; login preview + game hub
  routes/
    GamesPage.tsx  HomePage.tsx  PlayPage.tsx  StatsPage.tsx  LoginPage.tsx  RegisterPage.tsx
    ForgotPasswordPage.tsx  ResetPasswordPage.tsx   # public — see §7
e2e/                 # Playwright: auth, play, offline, a11y, password-reset — against a real backend
```

`sudoku.ts`, `gameReducer.ts` and `stats.ts` are pure — no network, no clock, no DOM — which is why
the rules, the stats and the conflict logic can be tested directly and the components above them stay
dumb. That's where most of the test suite lives. `boardMirror.ts` is the one exception among the
non-`use` files: it touches `localStorage`, but the decision that matters in it — `reconcile()`, §6 —
is a pure function of the server's board and the mirror, and is tested as one.

### The API client

```ts
// api/client.ts — sketch
let accessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;

async function refresh(): Promise<string> {
  // Single-flight: ten parallel 401s must produce ONE /refresh call, or token rotation
  // races itself and the whole family gets revoked as suspected theft.
  refreshInFlight ??= fetch("/api/v1/refresh", { method: "POST", credentials: "include" })
    .then(r => r.ok ? r.json() : Promise.reject(new SessionExpired()))
    .then(({ accessToken: t }) => (accessToken = t))
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

// `auth: false` marks the public endpoints — login, register, and the two password-reset calls.
// A 4xx from those means "wrong password" or "dead reset link", NOT "your session expired": routing
// one into refresh() would burn the refresh cookie and sign out a user who never had a session.
export async function apiFetch(path: string, init: RequestInit = {}, auth = true, retry = true) {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  // 401 *or* 403 — an expired token arrives anonymous and Spring answers 403. See §8, item 0.
  if (isAuthFailure(res.status) && auth && retry) {
    await refresh();          // throws SessionExpired -> AuthProvider routes to /login
    return apiFetch(path, init, auth, false);
  }
  return res;
}
```

`refresh()` rotating the token family means a concurrent double-refresh looks like **token reuse** to
`RefreshTokenService`, which revokes the entire family — logging the user out. The single-flight
promise is not an optimization, it's a correctness requirement.

**Session bootstrap.** On app load, call `/api/v1/refresh` once. If it returns a token, the user is
logged in (the cookie survived); if `401`, show the login screen. That is the only way to restore a
session, since the access token was deliberately never persisted.

**Username** comes from the JWT `sub` claim — base64-decode the payload for display purposes only,
never trust it for anything (there is no `/me` endpoint; see §8).

---

## 4. Responsive design — one app, two very different hands

The grid is the app. Everything else is chrome that rearranges around it.

### Layout

```
DESKTOP (>= 900px)                     MOBILE (< 900px, portrait)
┌──────────────────────────────┐       ┌─────────────────────┐
│  Cortex Clash      user ▾    │       │ ☰  moderate   12:04 │
├──────────────────┬───────────┤       ├─────────────────────┤
│                  │  12:04 ⏸  │       │                     │
│                  │  moderate │       │                     │
│    9×9 GRID      │           │       │      9×9 GRID       │
│    (square,      │  [1][2][3]│       │   (square, edge-    │
│     centred)     │  [4][5][6]│       │    to-edge-ish)     │
│                  │  [7][8][9]│       │                     │
│                  │           │       ├─────────────────────┤
│                  │ ✎notes ⌫  │       │  ↺   ⌫   ✎   💡    │
│                  │ ↺undo 💡  │       ├─────────────────────┤
└──────────────────┴───────────┘       │ 1 2 3 4 5 6 7 8 9   │  ← thumb zone
                                       └─────────────────────┘
```

- **Grid sizing:** `aspect-ratio: 1` on a CSS Grid, `width: min(90vw, 90vh - <chrome>, 640px)`. It stays
  square at every size; cells are `1fr`. Box borders are thicker rules drawn with `border-width` on
  `nth-child`, not nested elements.
- **Landscape phone** (short viewport): grid left, number pad right — a media query on
  `(orientation: landscape) and (max-height: 500px)`. Without this the grid gets squeezed to nothing.
- **Use `100dvh`, not `100vh`** — mobile browser chrome makes `vh` lie, and the number pad ends up
  under the URL bar.
- **`env(safe-area-inset-bottom)`** padding on the number pad so it clears the iPhone home indicator.

### Input model

Cell-first ("select a cell, then a digit") on both platforms — it's the one model that works with a
mouse, a thumb, and a keyboard.

**Desktop:** click to select; arrow keys or `WASD` move; `1`–`9` enter; `Backspace`/`Delete`/`0` erase;
`Shift`+digit (or toggle `N`) for notes; `H` for a hint; `C` to check; `Ctrl+Z` / `Ctrl+Shift+Z` (or
`Ctrl+Y`) undo/redo. The whole game is playable without touching the mouse — that's the desktop
power-user promise.

**Key handling binds to the window, not to the grid** (`useKeyboard`). Binding it to the grid element
is the natural-looking mistake: clicking any control — Notes, Check, a pad digit — moves DOM focus
onto that button, and every keystroke after that goes to the button instead of the grid. Click
"Notes" with the mouse, type a digit, nothing happens. The grid still owns *focus* (roving tabindex,
so a screen reader narrates the right cell); it just doesn't own the keys.

**Mobile:** tap to select; the docked number pad enters digits. Critical details:

- **No native keyboard, ever.** Cells are `<button>`s or `div[role=gridcell]`, never `<input>` — an
  iOS keyboard sliding up would shove the board off screen. Digits come only from the on-screen pad.
- **Touch targets ≥ 44×44 px** on the pad (Apple HIG / WCAG 2.5.5), sitting in the bottom third where
  a thumb reaches.
- **`touch-action: manipulation`** on cells and pad to kill the 300ms double-tap-zoom delay;
  `user-select: none` so a long-press doesn't pop the text-selection bubble mid-game.
- Notes/erase/undo/hint as an icon row between grid and pad, with notes mode a clearly-lit toggle.
- Haptic tick (`navigator.vibrate(10)`) on digit entry where supported.

### Visual affordances (identical on both)

Highlight the selected cell's row, column, and 3×3 box; highlight every cell holding the same digit;
render givens (`puzzle[i] !== '0'`) in a heavier, darker weight than player entries; mark conflicts
in red **and** with a ring, since colour alone fails colour-blind users and WCAG 1.4.1. Dark mode via
`prefers-color-scheme` plus a manual override. Honour `prefers-reduced-motion` on the completion
animation.

### Accessibility

`role="grid"` → `role="row"` → `role="gridcell"`, one tab stop for the grid with roving focus (arrow
keys move within it), `aria-label` per cell — *"row 3, column 5, empty"* / *"row 3, column 5, 7,
given"*. Conflicts and mistakes are carried in the accessible name as well as in colour.

The row layer is not optional: ARIA requires a grid's cells to sit inside rows, and a flat list of 81
`gridcell`s is invalid — a screen reader cannot announce position. The rows carry `display: contents`
so they provide the semantics without becoming grid items, leaving the flat 9-column CSS grid intact.

Audited with axe (WCAG 2.1 A + AA) on every screen, at both viewports, as part of the e2e suite —
`e2e/a11y.spec.ts`. It is a test, not a one-off: it fails the build if a violation reappears. The
first run found four real ones, including a primary button at 4.02:1 (below the 4.5:1 floor) and body
text at 3.79:1.

---

## 5. Game state

```ts
type GameState = {
  boardId: number;
  puzzle: string;                 // immutable; givens are puzzle[i] !== '0'
  solution: string;               // never rendered
  grid: number[];                 // 81, 0 = empty
  notes: ReadonlyMap<number, ReadonlySet<number>>;
  selected: number | null;
  notesMode: boolean;
  paused: boolean;
  checking: boolean;              // "am I right so far?" — one-shot, retired by the next edit
  hintsUsed: number;              // client-only; the backend has nowhere to record it
  elapsedSeconds: number;
  status: "in_progress" | "completed";
  completedAt: string | null;
  past: Snapshot[]; future: Snapshot[];   // undo/redo, client-only
  revision: number;               // bumped on every change the server needs to hear about
  savedRevision: number;          // …and the revision it has actually acknowledged
  savedElapsedSeconds: number;    // the clock's own high-water mark — see §6
};
```

Actions: `HYDRATE`, `SELECT`, `MOVE`, `INPUT_DIGIT`, `ERASE`, `HINT`, `CHECK`, `TOGGLE_NOTES_MODE`,
`SET_PAUSED`, `UNDO`, `REDO`, `TICK`, `SAVED`. A digit on a given cell is a no-op, and a board that
has come back `completed` accepts no edits at all — the reducer enforces both, not the components.
Notes are not a separate action: `INPUT_DIGIT` carries `asNote`, so `Shift`+digit pencils a mark
without leaving whatever mode the player is in.

There is no `dirty` boolean and no `COMPLETED` action, and both absences are deliberate. Unsaved
work is `revision !== savedRevision`, because a boolean would be cleared by a save that is still in
flight and lose every edit made while it was — see §6. Completion arrives as a `SAVED` carrying the
server's `status`, since the server is the one that decides it (constraint 7).

Undo/redo is purely client-side (the backend has no concept of it) and is dropped on reload, which is
fine and expected.

**Derived, not stored:** conflicts, remaining-digit counts (grey out a `9` on the pad once nine are
placed), and completion — all computed from `grid` + `solution` on render. Cheap at 81 cells.

### Timer

`setInterval` at 1s incrementing `elapsedSeconds`, but **pause on `visibilitychange`** — a phone in a
pocket must not clock four hours onto the board. Also pause on an explicit pause button (which should
blur the grid, or pausing becomes a way to keep studying it). Flush the elapsed time on `pagehide`.

---

## 6. Saving — and the multi-device problem

**Autosave policy:** debounce 2s after the last edit, plus a forced flush on `visibilitychange →
hidden` and on `pagehide`. This keeps writes to roughly one per burst of typing instead of one per
keystroke.

Two traps here, both of which we fell into and now have regression tests for (`useAutosave.test.tsx`):

- **The debounce must key on the edit counter, not on the state object.** The clock ticks once a
  second, producing a new state each time. A debounce that depends on `state` is reset by every tick,
  so a 2s debounce under a 1s clock *never fires* — no save ever left the browser.
- **Elapsed time needs its own high-water mark.** A tick is not an edit, so the revision counter
  doesn't move, so nothing schedules a save. A player who thinks for ten minutes and then closes the
  tab would bank none of it; the flush on the way out has to send elapsed time even when the grid is
  untouched.

**Offline** (`boardMirror.ts`): a `localStorage` mirror of the active board keyed by `boardId`, written
on every change. If a `PUT` fails, keep playing — the work is safe locally — and flush when `online`
fires. Since the solution is client-side, a claimed board is fully playable with no connectivity at
all. The save indicator says *"Saved on this device"* rather than showing an error, because nothing
has been lost.

**Offline play takes four things, not one**, and missing any of them makes the promise false. Each of
these was found by actually pulling the network in a browser, not by reasoning:

1. **The service worker** precaches the shell, so the app loads with no network.
2. **The mirror stores the whole board** — puzzle and solution, not just the moves. `GET /boards` is
   the only way to fetch a board by id, and it cannot answer offline. Store only the moves and a
   reload brings back the shell, fails the fetch, and renders *"that board isn't yours"* over a board
   the player is holding in their hand.
3. **`PlayPage` falls back to the mirror** when the fetch fails, instead of treating it as fatal.
4. **A network error is not an auth failure.** The session bootstrap is a `POST /api/v1/refresh`,
   which offline cannot land — and treating that as "not signed in" bounces the player to the login
   screen, which is both wrong and useless to them (they cannot sign in offline either). So the
   client distinguishes `NetworkError` from `SessionExpiredError`: a 401 means signed out, an
   unsendable request means *unknown*, and a browser that had a session keeps playing in an
   `offline` auth state until the network returns.

On reconnect it all catches up on its own. Note that the first `PUT` after an offline reload comes
back **403** — the in-memory access token died with the page and can't be reminted offline — which
drives a refresh and a replay. That 403 is the mechanism working, not a failure; a test that waits
for "the first PUT" and asserts 200 will fail against a perfectly healthy app.

**The clobber risk.** Constraint 5: saves are last-write-wins with no version check. Start a board on
your laptop, resume it on your phone, then let the laptop tab flush a stale autosave — your phone's
progress is gone.

The real fix is optimistic concurrency on the backend (§8, item 1). Until it exists, the mirror also
records the server's `lastModifiedAt` as of the last time this device was in sync, and `reconcile()`
compares it on open:

| | |
|---|---|
| no mirror, or nothing unsaved in it | take the server's board |
| mirror has unsaved edits, server stamp **unchanged** | resume from the mirror — that is just this device's own work coming back from an offline stretch or a dead tab |
| mirror has unsaved edits **and** the server stamp has moved | **conflict**: another device has been playing this board. Both versions have progress and one is about to be lost, so we ask rather than pick |

Picking silently would mean destroying someone's work without telling them. Asking is the honest
behaviour available to us given the API.

**Completion:** when `grid === solution` locally, flush immediately, expect `status: "completed"`,
then freeze the board and show the completion screen (time, difficulty). A `409` means it was already
completed elsewhere — treat it as success and freeze. A board arriving from `/boards` already
`completed` is rendered read-only.

---

## 7. Routes and screens

| Route | Screen | Auth | Notes |
|---|---|---|---|
| `/login` | Login | public | The server strips the reason from a `401` (§8, item 0b), so the copy is ours — and a locked-out account (`SECURITY_LOCKOUT_THRESHOLD`) is, unhappily, indistinguishable from a wrong password. Handle `429`: API Gateway throttles auth to 5 rps and register to **1 rps / burst 3**. |
| `/register` | Register | public | Mirror the server's validation: username ≤ 25, email ≤ 50 and format-checked, password ≥ 8 chars and ≤ 30 UTF-8 bytes. `409` → "username or email already taken". |
| `/forgot-password` | Forgot password | public | Email → `POST /request_password_reset`. Renders one neutral confirmation no matter what comes back (constraint 8) — it must not become an account-enumeration oracle. |
| `/reset-password?token=` | Reset password | public | Redeems the token from the emailed link. The link deep-links straight in, which works because CloudFront already maps `403`/`404` → `/index.html` (`docs/deployment.md` §2) — no infrastructure change. The raw token stays in the URL and is never persisted. Success does **not** sign you in: it sends you to `/login`, because a reset proves control of an inbox, not intent to start a session. |
| `/games` | Game hub | guarded | The post-login landing (login and register send you here, unless a guarded deep link bounced you through `/login`, in which case you return there). A game picker: the Sudoku tile → `/`; a second tile is a placeholder for games still to come. No API calls of its own. |
| `/` | Home | guarded | Difficulty picker (easy / moderate / hard) → `GET /board`; below it, the in-progress boards from `GET /boards` to resume. `503` → "we're baking fresh puzzles, try again in a moment" with a retry that backs off (the pool refills on a 5-minute cron). |
| `/play/:boardId` | Play | guarded | The grid. Hydrates from the query cache or the localStorage mirror. |
| `/stats` | Stats | guarded | **Free win:** `GET /boards` already returns every board with status, difficulty, and `elapsedSeconds`. Completed count, best and average time per difficulty, current streak — all derived client-side, zero backend work. |

The two reset screens are public by necessity: a user who needs them cannot authenticate, by
definition. Everything else sits behind `RequireAuth`.

PWA (shipped in phase 4): web-app manifest, installable to a phone home screen, service worker
precaching the shell so a claimed board opens offline.

---

## 8. Gaps to raise with the backend

Nothing here blocks a v1 — but these are what the front-end will keep bumping into. Items 1–2 were
found by running the front-end against the real backend, not by reading it.

0. **An expired access token returns `403`, not `401`** *(verified against a running backend)*.
   `JwtAuthenticationFilter` catches the `JwtException`, clears the security context, and calls
   `filterChain.doFilter(...)` anyway — so the request arrives *anonymous*, and Spring Security, which
   has no `AuthenticationEntryPoint` configured, answers `403`. The conventional contract is `401` for
   "you are not authenticated" and `403` for "you are, but you may not do this". The client now treats
   both as an auth failure and refreshes on either (`isAuthFailure` in `api/client.ts`), so this is
   handled — but any client written to the conventional contract would appear to work and then log
   every user out at the 15-minute token expiry. Worth a `.exceptionHandling(...)` entry point.

0b. **Error responses carry no usable message.** The controller throws
   `ResponseStatusException(401, reason)`, but Spring's `server.error.include-message` defaults to
   `never`, so the reason is stripped and the body is just `{"error": "Unauthorized"}`. The practical
   cost: a **locked-out account is indistinguishable from a wrong password**, so we can't tell the user
   why they can't get in. Needs either `include-message: always` or a structured error body.

   Still open, and now visibly worked around: `/v1/reset_password` and `/v1/refresh` build their
   error bodies by hand (`ResponseEntity.badRequest().body(Map.of("error", …))`) precisely to dodge
   this, which is why the reset screen can say *"this link has expired"* versus *"pick a better
   password"* while the login screen cannot say *"you are locked out"*. The client reads
   `body.message ?? body.error` and every new endpoint has to remember to hand-roll the body. One
   `@ControllerAdvice` would settle it for all of them.

1. **Optimistic concurrency on `PUT /boards/{id}`** *(highest value)*. A `version` column, or honouring
   `If-Unmodified-Since`, so a stale device gets a `409` instead of silently destroying progress.
   Directly caused by the "PC **and** mobile" requirement.
2. **`DELETE /api/v1/boards/{id}`** — there is no way to abandon a board. `GET /boards` grows without
   bound and the resume list turns into a graveyard. (Client-side we'd paginate, but that's papering.)
3. **`GET /api/v1/me`** — the username is only available by decoding the JWT client-side. Fine for a
   label, not something to build on.
4. **Pagination on `GET /boards`** — today it returns *every* board a user has ever touched, each with
   four 81-char strings and a notes blob. At a few hundred boards that's a slow, fat payload on a
   phone.
5. **CORS for local dev** — optional. The Vite proxy makes it unnecessary, and *not* having CORS is a
   defensible security posture given the same-origin CloudFront topology. Worth an explicit decision
   rather than an accident.
6. **The solution is shipped to the client.** Unavoidable for offline play and instant validation, and
   fine for a casual game — but if leaderboards or competitive scoring ever land, times become
   unverifiable. Decide now, not after.

---

## 9. Repo layout

The front-end lives **entirely in `mind-games-ui`** (`git@github.com:birke54/mind-games-ui.git`).
`mind-games-backend` is not touched. Two repos, two independent pipelines:

```
mind-games-backend  ──▶ ECR ──▶ ECS Fargate ──▶ /api/*  ┐
                                                        ├─▶ one CloudFront distribution
mind-games-ui       ──▶ S3  ──────────────────▶ /       ┘
```

They meet only at CloudFront, which is also what makes them same-origin — the constraint the whole
auth design hangs on (§1.1, §1.2). The coupling between the repos is therefore exactly one thing:
**the API contract in §1**, mirrored in `src/api/types.ts`. Nothing else crosses the boundary.

Consequence worth naming: a breaking change to a backend DTO will not fail the backend's build. If
that starts to bite, the cheap fix is to have the backend publish an OpenAPI document and generate
`types.ts` from it, rather than merging the repos.

---

## 10. Local development

Same-origin is non-negotiable (constraint 1), so the dev server proxies:

```ts
// vite.config.ts
const proxy = {
  "/api": { target: process.env.VITE_API_TARGET ?? "http://localhost:8080", changeOrigin: false },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({ /* … */ })],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },   // `vite preview` serves the real build; e2e runs against it
});
```

`changeOrigin: false` keeps the `Host` header intact and the cookie's `Path=/api/v1` scope matches
without translation. The `preview` server needs the same proxy for the same reason — it is what the
Playwright suite drives, service worker and all. Run the backend with `COOKIE_SECURE=false` (otherwise
the browser drops the refresh cookie over plain HTTP) and `ORIGIN_VERIFY_SECRET` blank (otherwise
`OriginVerificationFilter` `403`s everything). Both are already the documented local defaults.

The password-reset e2e specs additionally need an SMTP server to read the emailed link out of — the
raw token exists nowhere else. See the README; without one they skip rather than fail.

**Deploy:** `vite build` → sync `dist/` to the S3 bucket behind CloudFront's default behavior, then
invalidate. Hashed assets get `immutable` caching; `index.html` must be `no-cache` or users pin to a
stale bundle. CloudFront needs a custom error response mapping `403`/`404` → `/index.html` with a
`200`, or every deep link (`/play/42`) breaks on refresh. A GitHub Actions workflow mirroring the
backend's `build-push-ecr.yml` (OIDC role, no long-lived keys) does the sync.

---

## 11. Phasing

| Phase | Deliverable | Proves | Status |
|---|---|---|---|
| **0** | Vite + TS + Tailwind scaffold, dev proxy, API client, pure sudoku helpers + tests | The same-origin topology works before any feature depends on it. | **done** |
| **1** | Register, login, session bootstrap on load, silent refresh, logout, route guard | The trickiest infrastructure (token rotation, single-flight refresh) is done first, not bolted on. | **done — verified end to end against a live backend** |
| **2** | Selection, desktop keyboard + mobile number pad, notes, undo/redo, timer, autosave, completion | A playable game on both form factors. This is the demo. | **done — verified end to end, including solving a board** |
| **3** | Hints & check, derived stats page, resume-list polish | Feature-complete for a v1. | **done — verified end to end** |
| **4** | S3/CloudFront deploy workflow, PWA + offline play, a11y audit, Playwright e2e at both viewports | Ship quality. | **done** |
| **5** | Forgot / reset password, end to end through a real inbox | An account is recoverable. Until this, a forgotten password was a dead account. | **done — verified against Mailpit, link read out of a real email** |

Phases 0–1 are where the risk is; 2 is where the product appears.

### What verification actually caught

Every phase turned up at least one bug that the unit tests could not have found, because each was a
mistake about how the *real* system behaves rather than about the logic:

| Phase | Bug |
|---|---|
| 1 | An expired token returns **403, not 401**, so the silent refresh never fired — every session would have died at the 15-minute mark. |
| 2 | The clock ticked once a second and reset the 2-second autosave debounce, so **no save ever left the browser**. |
| 2 | The save status was captured from a stale ref after `dispatch`, pinning the indicator on "…" forever. |
| 3 | Key handling was bound to the grid, so **clicking any control with the mouse silently killed the keyboard**. |
| 4 | axe found four WCAG violations, including a primary button at 4.02:1 and body text at 3.79:1. |
| 4 | The board mirror stored only the moves, so an offline reload rendered *"that board isn't yours"* over a board in the player's hand. |
| 4 | The session bootstrap treated an unsendable request as a dead session, so **going offline logged you out**. |
| 5 | `/request_password_reset` answers **202 with an empty body**; parsing it as JSON threw a `SyntaxError` on the success path, so a reset that had been sent looked like a failure. |
| 5 | The reset link is only readable from a real inbox — the backend stores `sha256(raw)` and never keeps the raw token — so the happy path is untestable without a mailbox. The e2e suite runs one (Mailpit); see the README. |

The pattern is consistent enough to be worth stating: the bugs live in the seams between the client
and the things around it — the backend's actual status codes, the browser's event loop, the network.
Drive the real thing.
