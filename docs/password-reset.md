# Password reset — design

A player who forgets their password currently has no way back into their account. This is the design
for giving them one. It spans both repositories: most of the work is in
[`mind-games-backend`](https://github.com/birke54/mind-games-backend) (default branch `master`), and
the front-end is two screens and two API calls.

Nothing here is built yet. This document is the plan, and the reasoning behind the parts that are
easy to get wrong.

---

## 1. The blocker: the backend cannot send email

There is no mail dependency in `build.gradle`, no `JavaMailSender`, no SES client — the backend has
never sent a message of any kind.

That is the whole feature. Password reset is email delivery with a small amount of token bookkeeping
attached; the bookkeeping is a day's work and follows patterns the backend already has. Getting mail
out of the ECS task is the part that is actually new.

**Start the AWS side before writing any code**, because it has a lead time you cannot compress. SES
needs a verified identity for `cortexclash.org` with DKIM, and — the part that bites — every SES
account begins in **sandbox mode**, which can only send to individually verified addresses. Until AWS
grants production access (a review measured in hours to days), password reset will appear to work in
testing and silently reach nobody else. Request production access on day one and build while it is
pending.

## 2. Send over SMTP, not the SES SDK

This is the decision with the longest shadow, and testability is what settles it.

The reset token has to be stored the way `refresh_tokens` already stores its tokens: SHA-256 of the
raw value, with the raw value never persisted (`RefreshTokenService.sha256`). That is correct and not
negotiable. But it has a consequence worth stating plainly:

> The raw token exists in exactly one place — the email.

It is not in the database. It cannot be recovered from the database. So if mail goes out through the
SES SDK, **nothing can ever read a reset link**, and the happy path — request a reset, click the
link, set a password, log in — is untestable end to end. The failure cases would have e2e coverage
and the success case would not, on the most security-sensitive flow in the app.

Use `spring-boot-starter-mail` and speak SMTP instead. Then:

- **production** points at SES's SMTP endpoint, and
- **CI** points at a [Mailpit](https://github.com/axllent/mailpit) container.

`e2e.yml` already stands up MySQL and the backend image; a third container costs almost nothing. The
Playwright spec then reads the message from Mailpit's HTTP API, extracts the link, and drives the
real flow. Same code path in both places — only `spring.mail.host` differs.

The price is that SES SMTP authenticates with credentials rather than the task's IAM role, so they
go in Secrets Manager. The taskdef already pulls `JWT_SECRET`, `DB_USERNAME`, `DB_PASSWORD` and
`ORIGIN_VERIFY_SECRET` from Secrets Manager, so this adds a fifth entry to an established pattern
rather than a new mechanism.

## 3. Backend

### 3.1 Schema — `V3__password_reset.sql`

A new table, modelled on `refresh_tokens` because it is the same kind of object:

```sql
CREATE TABLE `password_reset_tokens` (
    `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id`    INT UNSIGNED NOT NULL,
    -- SHA-256 hex of the raw token. The raw value is never stored; it exists only in the email.
    `token_hash` VARCHAR(64) NOT NULL UNIQUE,
    `expires_at` TIMESTAMP NOT NULL,
    -- Single use. Set on redemption; a token with this set is dead.
    `used_at`    TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_password_reset_tokens_user`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    INDEX `idx_password_reset_tokens_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

and a `MODIFY COLUMN` on `user_audit.action` to add `password_reset_requested` and
`password_reset_completed`. V2 already extended that ENUM once, so there is precedent for how.

### 3.2 `PasswordResetService`

Mirror `RefreshTokenService` closely enough that a reader of one can read the other: 32 bytes of
`SecureRandom`, URL-safe Base64 without padding, store `sha256(raw)`.

It differs in three ways, all deliberate:

| | Refresh token | Reset token |
|---|---|---|
| TTL | 30 days | **30 minutes** |
| Reuse | Rotated; reuse revokes the family | **Single use** (`used_at`) |
| On issue | Extends a family | **Invalidates any outstanding token for that user** |

### 3.3 Endpoints

Two, both added to the `permitAll()` list in `SecurityConfig` — a user who needs these cannot
authenticate by definition. Naming follows the existing `/api/v1/authenticate_user`:

```
POST /api/v1/request_password_reset   { "email": "..." }              -> 202, always
POST /api/v1/reset_password           { "token": "...", "password": "..." }
                                                                      -> 204 | 400
```

### 3.4 The four properties that matter

**Return 202 unconditionally.** The request endpoint must answer identically whether or not the
address has an account. Anything else — a different status, a different body, a materially different
response time — turns it into a user-enumeration oracle, and `users.email` is `UNIQUE`, so a
confirmed address is a confirmed account.

**Revoke every session on success.** Call `refreshTokenService.revokeAllForUser(userId)`, which
already exists. If the reset is happening because the account was compromised, leaving the attacker's
refresh-token family alive defeats the entire exercise.

**Clear the lockout.** Set `status` back to `active` and `failed_attempts` to `0`. The schema has
`status ENUM('active','locked_out')` and `SECURITY_LOCKOUT_THRESHOLD` is `5`, which means *the single
most common reason a real person resets their password is that they have been locked out by failed
attempts*. If the reset does not clear it, they set a new password and still cannot log in — and the
symptom ("my new password doesn't work") points at exactly the wrong place.

**Rate limit both routes.** `LoginPage` already handles a `429` from API Gateway throttling auth
routes at 5 rps; extend that throttle to these two. Add a per-user cap as well (3 requests/hour).
Without one, the endpoint is an anonymous email cannon aimed at any address someone cares to type.

### 3.5 A gap to fix while you are here: there is no password policy

`RegisterUserRequest` declares `@NotBlank String password` and nothing more. No minimum length, no
complexity rule. Today `a` is a valid password.

Validating the new password on reset is obviously right — but validating it *only* there produces an
absurdity: a password you were allowed to register with, but are not allowed to reset to. Add one
shared validator, apply it to both paths, and export the minimum length from `src/api/types.ts`
beside `USERNAME_MAX_LENGTH` so the client enforces the same rule it will be judged by. This is much
cheaper now than once there are users whose existing passwords fail the new policy.

## 4. Front-end

Two public routes in `App.tsx`, beside `/login` and `/register`:

| Route | Screen |
|---|---|
| `/forgot-password` | Email field. Submits, then shows the neutral confirmation. |
| `/reset-password?token=…` | New password + confirm. Lands here from the email. |

**Deep-linking already works.** CloudFront's custom error responses map 403 and 404 to `/index.html`
with a `200` (see [deployment.md §2](./deployment.md)), which is what makes every client-side route
work today. The emailed link needs no infrastructure change.

Two functions in `api/client.ts` — `requestPasswordReset(email)` and `resetPassword(token, password)`
— both unauthenticated, so both must bypass the bearer-token header and the silent-refresh
interception. A 401/403 from these means "bad token", not "session expired", and must not be routed
into the refresh path.

`LoginPage` gets a "Forgot password?" link.

`ForgotPasswordPage` shows the same confirmation regardless of what the server said: *if that address
has an account, we've sent a link*. The client must not be the thing that leaks what the API was
careful not to.

`ResetPasswordPage` reads the token from the query string and **immediately strips it with
`history.replaceState`**. A secret in a URL is a secret in the browser's history, in the back button,
and in the `Referer` header of anything the page subsequently loads. Read it once into memory, then
remove it from the address bar.

On success, route to `/login` rather than signing the user in. A reset proves control of an inbox, not
intent to start a session, and the user has just been logged out of every device on purpose.

Both screens are picked up automatically by the axe WCAG 2.1 AA audit in `e2e/a11y.spec.ts`, which
walks every route.

## 5. Testing

| Layer | Covers |
|---|---|
| Backend integration | request → token issued → redeem → old refresh tokens dead → lockout cleared → login with the new password |
| Backend unit | expiry, single use, reissue invalidates the previous token, unknown email still returns 202 |
| UI unit | the two client functions; the neutral confirmation; expired/used token rendering |
| e2e (with Mailpit) | the real flow, end to end, in a browser |
| e2e | the failure paths — expired link, reused link, mismatched confirmation |
| e2e (axe) | both new screens, free, on desktop and mobile viewports |

The Mailpit row is the one that only exists if §2 goes the SMTP way. It is the reason to.

## 6. Order of work

1. **AWS, immediately** — SES identity, DKIM, and the production-access request. Gates release, not
   development.
2. **Backend token flow** — migration, service, endpoints, tests. Can merge before mail works at all:
   log the link instead of sending it.
3. **Mail** — `spring-boot-starter-mail`, SES SMTP in the taskdef, Mailpit in `e2e.yml`.
4. **Front-end** — the two screens, the client functions, the specs.

Two to three days of work, most of it in the backend, plus however long AWS takes to let you send
mail to strangers.

## 7. Open questions

- **Should a reset email be sent to an address that has no account?** No — but consider whether the
  *absence* of an email is itself a signal to someone who typed a stranger's address. It is; there is
  no fix that does not involve sending mail to non-customers, and nobody does that. Accept it.
- **Is the email address trustworthy?** Registration never verifies it. Anyone can sign up with
  someone else's address, which means someone else can reset that account. This is a pre-existing hole
  that password reset makes *reachable* rather than creates. Email verification at registration is the
  real fix and is out of scope here, but it should go on the list in [DESIGN.md §8](../DESIGN.md).
