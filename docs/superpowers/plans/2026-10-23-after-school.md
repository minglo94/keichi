# After-school Automation Implementation Plan
> Implement inline with executing-plans; user selected direct implementation. Preserve spec and progress ledger; use synthetic test data.
**Goal:** deterministic daily after-school announcements, approved activities and scheduled device reminders with a manual preview/run interface.
**Spec:** docs/superpowers/specs/2026-10-23-after-school-design.md
**Architecture:** Google Sheets read-only service account → validated roster → transactional daily run/activity/announcement + reminder outbox → authenticated external scheduler tick; no LLM.
**Stack:** existing Next.js/Prisma/Postgres/Zod/ExcelJS/web-push; node:test + tsx.

## Tasks
- [x] 1. Pure model/validation: create src/lib/after-school/{model,validation}.ts and tests/after-school-model.test.ts. RED missing parser; implement parseRows(rows,date,year), scheduleFor(date), formatAnnouncement. Test Excel serial/ISO/D-M dates, templates, duplicate/conflicting groups, Monday and Tue–Fri timings, class# output and no name/note.
- [x] 2. Add additive AfterSchoolConfig/Run/Group/Reminder/PushAttempt/Lease models and SQL relative to existing schema; repair existing npm lock mismatch. Implement auth.ts, source.ts and repository.ts. Test persisted run and settings optimistic versions; no production DB operations.
- [x] 3. Implement service.ts prepare(date,actor) and tick(now), leases, source hash, roster resolution, holidays, idempotent upsert and local calendar. Test same-day repeat creates one announcement/two activities, assignments, removals and source errors; no unmatched user substitution.
- [x] 4. Implement delivery.ts durable per-stage/per-user/per-device attempts, atomic SENDING claim, exact-once in-app notification, accepted/failed/unknown/no-device results. Test two reminders, repeated ticks, partial failure, unknown never retried, late stages skipped; announcement publication at07:00, first delivery at08:15.
- [x] 5. Add api/after-school/{config,preview,run,status}, api/cron/after-school; UI AfterSchoolPanel at PA announcements, read-more control, settings enable authorization. Test admin/chair/student permissions, schedule credential and setup readiness.
- [x] 6. Run pure and local synthetic DB/API tests, TypeScript/lint/build and browser as available; independent final review, fix verified findings. Write docs/AFTER_SCHOOL_AUTOMATION.md (read-only service account, exact original settings, VAPID, scheduler install, SQL rollback); create draft PR, no merge/deploy.

## Review focus
Stale source must not become zero; date parsing must not swap D/M; incomplete student mapping blocks output; retry may never resend accepted/unknown devices; same-day edits must cancel removed students; disabled/revoked approver stops scheduler; fake x-forwarded/date cannot select another day. Each belongs to the task owning its logic and its tests.

Validation: 10 node:test cases pass; synthetic PGlite DB + HTTP role/origin/cron/hash/managed-resource checks pass. Desktop/mobile browser preview and repeated-run flow passed. TypeScript and production build pass; existing four lint warnings and HEIC dependency warning remain. Google Fonts mocked in the constrained test environment. Independent review findings addressed: identity conflict, activity overlap, ownership guards, row-locked notification creation, lease expiry fencing and expired-stage suppression. Latest user change: first reminder08:15; publication07:00 unchanged. Production setup remains explicitly disabled/unconfigured in this work.

Final verification: the built production app passed the complete synthetic DB, HTTP and desktop/mobile browser flow, including08:15 display and admin/chair separation. A dev-mode browser rerun encountered a script-loading SyntaxError; production build and production-mode browser checks passed. No native staging database or live Google/push endpoint was exercised.
