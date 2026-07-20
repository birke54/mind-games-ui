# mind-games-ui

React front-end for [`mind-games-backend`](https://github.com/birke54/mind-games-backend) — a Sudoku
game that plays on desktop and mobile from one codebase.

- **[DESIGN.md](./DESIGN.md)** — the design: the API contract, the constraints the backend imposes on
  the client, the responsive input model, and the phasing.
- **[docs/deployment.md](./docs/deployment.md)** — S3 + CloudFront, and the caching rules that break
  deploys if you get them wrong.
- **[docs/password-reset.md](./docs/password-reset.md)** — design for password reset, not yet built.
  Spans both repos; the backend cannot currently send email at all, which is most of the work.

## Running it

The backend ships **no CORS configuration**, and its refresh cookie is `SameSite=Strict; Path=/api/v1`.
The app must therefore be same-origin with the API — always. CloudFront provides that in production;
the Vite dev proxy provides it locally. Pointing the app straight at the API's public URL cannot work.

Start the backend on `:8080` with:

- `COOKIE_SECURE=false` — otherwise the browser drops the refresh cookie over plain HTTP and every
  reload logs you out.
- `ORIGIN_VERIFY_SECRET` unset — otherwise `OriginVerificationFilter` 403s anything not arriving
  through CloudFront.

Then:

```bash
npm install
npm run dev        # http://localhost:5173, proxying /api -> localhost:8080
```

Override the proxy target with `VITE_API_TARGET` if the backend is somewhere else.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the `/api` proxy |
| `npm run build` | Typecheck and build to `dist/` |
| `npm test` | Unit tests (Vitest) — pure logic, no backend needed |
| `npm run test:e2e` | End-to-end tests (Playwright), **needs a running backend** |
| `npm run preview` | Serve the production build |

The e2e suite deliberately runs against a real API rather than mocks: the things most worth testing —
the refresh-cookie session bootstrap, claiming a board, last-write-wins saving — are exactly the
things a mock would get wrong. It also runs an [axe](https://github.com/dequelabs/axe-core)
accessibility audit against every screen, at both a desktop and an iPhone viewport.

### Password-reset specs need a mailbox

`password-reset.spec.ts` reads the reset link out of a real email, because that is the only place it
exists: the backend stores the token as `sha256(raw)` and never persists the raw value. Without a
mailbox to read, the happy path cannot be tested at all — which is why the backend sends over SMTP
rather than through the SES SDK.

So they need [Mailpit](https://github.com/axllent/mailpit), and a backend told to send through it:

```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit   # SMTP on 1025, HTTP API on 8025
```

then start the backend with `PASSWORD_RESET_MAILER=smtp`, `MAIL_HOST=localhost`, `MAIL_PORT=1025`,
`MAIL_SMTP_AUTH=false`, `MAIL_SMTP_STARTTLS=false`, and
`PASSWORD_RESET_URL=http://localhost:4173/reset-password` (the address Playwright actually browses —
the default points at production, and the test would follow the link there).

Without Mailpit the reset specs **skip** rather than fail, so they stay out of the way on a laptop.
CI always has it, and `e2e.yml` fails the run if it does not come up. Override the API's location
with `MAILPIT_URL`.

## Playing

Cell-first on both platforms: select a cell, then enter a digit.

| Key | |
|---|---|
| Arrows / WASD | move |
| `1`–`9` | enter a digit |
| `Shift` + digit | pencil a note |
| `N` | notes mode · `H` hint · `C` check |
| `Backspace` | erase |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |

On a phone, digits come from the on-screen pad — the cells are buttons, never `<input>`s, so tapping
one can't raise the native keyboard and shove the board off screen.

A claimed board is **fully playable offline**: its solution ships with it, and every move is mirrored
to `localStorage` and pushed up when the network returns.
