# Daily Blackboard Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Ten lesson cells, selected-day class activities, and auto-approved chair/admin creations.
**Architecture:** Keep existing weekly timetable rows; group at presentation. Add a date-scoped, session-bound activity API with minimal projection. Reuse committee approval permissions and calendar publishing for privileged creation.
**Tech Stack:** Next.js 14, React, Prisma, TypeScript.
**Spec:** docs/superpowers/specs/2026-10-23-blackboard-dates-design.md; user additionally requests chair/admin automatic approval.

## Global Constraints
Hong Kong dates; only approved class-assigned activities; no names, notes or student IDs in class responses. No schema changes. Existing teacher cards remain published by actual time.

## Review Focus
Invalid dates; date-switch races; cross-class data; cross-day activities; chair of another committee.

### Task 1: Daily projections
Files: new src/lib/blackboard/daily.ts, tests/blackboard-daily.test.ts, new daily-activities.ts.
Interface: lessonCells(rows, slots, day), dateWindow(date), getClassDayActivities(classId,date).
- [x] Tests first: ten cells, combined subjects preserving group, weekends, invalid/leap dates and HK boundaries. Run node --import tsx --test tests/blackboard-daily.test.ts, expect missing module then pass.
- [x] Implement pure helpers, DB query joining only class enrollment assignments and approval. Include overlapping ongoing activities and null-end start-day activities.
- [x] Add GET /api/blackboard/day?date=YYYY-MM-DD using class session only; reject duplicate/invalid dates. Explicit minimal fields.

### Task 2: Date UI
Files: BoardViewer.tsx, BoardCard.tsx, new DayActivities.tsx; BoardGrid.tsx optional selectedDate prop.
- [x] Replace per-row timetable tiles with ten cells. Use date prop and only highlight today; retain full-week toggle and named extra periods separately.
- [x] Date navigator owns selected date. Activities fetch aborts on change and hides old-date contents; errors permit retry. Today follows midnight until user selects a fixed date.
- [x] HTTP tests prove dates, class isolation, projection, pending exclusion and after-school tagging.

### Task 3: Auto approval
Files: src/app/api/activities/route.ts and activity overview copy.
- [x] Extend HTTP tests: admin and matching-chair approved with approver/time/calendar; teacher and other-chair pending; committee-less admin approved.
- [x] Run RED against existing server, then fresh DB actor role + canEditCommittee. Privileged creates publish calendar after assignments, return updated calendar id.
- [x] Update creation help/success copy if it claims every activity awaits review.

### Task 4: Verify and integrate
- [x] Run unit suites, tsc, lint, production build, combined synthetic HTTP/DB suites.
- [x] Fresh reviewer checks whole diff, fix important findings with regression tests.
- [x] Commit, push PR, merge under existing user authorization. Report production deployment limits and no db push required.
