# Security — 基智中學 EduPortal

Record of the security review (2026-06-17) and the fixes applied.

## ⚠️ ACTION REQUIRED BY YOU — rotate leaked secrets

`.env` was committed to git and contained **real** credentials. It has now been
removed from tracking (`git rm --cached .env`), but **the old values remain in
git history and must be treated as compromised.** Rotate them now:

1. **Anthropic API key** — console.anthropic.com → API Keys → revoke the old
   `sk-ant-…`, create a new one, update `ANTHROPIC_API_KEY` in Zeabur.
2. **`AUTH_SECRET`** — regenerate: `openssl rand -base64 32`, update in Zeabur.
   (Rotating this logs everyone out — expected.)
3. **Database password** — rotate the PostgreSQL password in Zeabur and update
   `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.

Until these are rotated, anyone with the git history can use them.

## Fixes applied in this round

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | `.env` with live secrets tracked in git | `git rm --cached .env`; rotate (above) |
| 2 | CRITICAL | Command injection via `exec()` in `/api/log` (unauth) and `/api/calendar-events` | New `src/lib/obsidian-log.ts` uses `execFile` (arg array, no shell); `/api/log` now requires auth + Zod |
| 3 | CRITICAL | Privilege escalation — any TEACHER could hit `/api/admin/*` and create ADMIN accounts | All admin **mutations** now require `isAdmin`; `admin/users` POST Zod-validates role; reads teachers legitimately need (users/classes GET) stay staff-level |
| 4 | HIGH | Stored XSS — HTML committee tool iframe used `sandbox="allow-scripts allow-same-origin"` (sandbox voided) | Removed `allow-same-origin`; HTML-tool create/edit restricted to `isAdmin` |
| 5 | HIGH | No rate limiting (login brute-force + AI cost abuse) | New DB-backed `src/lib/rate-limit.ts`; login 10/15min per email; AI endpoints per-user hourly cap (students tighter) |
| 6 | MEDIUM | `/api/committee-tools?ids=` leaked arbitrary tool content to any user | `?ids=` branch now staff-only + capped at 100 ids |
| 7 | MEDIUM | User CSV import: no row cap, no password-strength check | Capped at 1000 rows; passwords must be ≥ 8 chars |

## Known residual items (documented, lower urgency)

- **`allowDangerousEmailAccountLinking: true`** (`src/lib/auth.ts`) auto-links a
  Google login to any pre-existing account with the same email. Safe only because
  Google verifies addresses; consider disabling for privileged roles.
- **Login rate limit is per-email**, not per-IP (getting the client IP inside the
  NextAuth `authorize` callback is awkward). Good enough to blunt targeted
  brute-force; revisit if IP-based limiting is needed.
- **`missions/[id]/submit`** stores `body.content` largely as-is; it is only ever
  rendered as text (never `dangerouslySetInnerHTML`), so it is not an XSS vector
  today — keep it that way.

## Deploy note

The rate limiter adds a `RateLimit` table — run `pnpm db:push` on deploy.
