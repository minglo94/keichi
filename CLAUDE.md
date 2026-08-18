# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Start here, then read `AGENT_HANDOFF.md`** for the current phased work order (what's broken, what's next, acceptance criteria per task). `docs/BUILD_SPEC.md` is the *original* Sprint 0–5 build spec — historical only; the app has grown far beyond it (Keida agent system, 30+ additional Prisma models). Trust this file, `ROADMAP.md`, `dazhi.md`, and the code over `docs/BUILD_SPEC.md`.

## What this is

**Keichi EduPortal (基智若愚 ICHI / AI 大智若愚)** — a combined teaching + school-administration platform for a Hong Kong secondary school. Two user-facing halves:
- **Teaching**: class join-codes, a mission map with prerequisite unlocks, SM-2 spaced-repetition flashcards, a points/leaderboard system broadcast in real time, AI quiz generation and Prompt-Engineering grading.
- **School admin ("EduPortal")**: announcements (priority levels + Google Calendar sync), todos, calendar, behavior records with discipline email-threshold alerts, committee tools (IT/Admin/Discipline/Curriculum/ECA), asset & room-booking management, procurement requests, activities, student groups, CSV import/export, and the **Keida multi-agent assistant** (see below).

UI language is Traditional Chinese; agent replies use 廣東話書面語 (see `prompts/agents/*.md` for tone). Design targets iPad-first touch use for 36–45-student classes.

## Commands

```bash
npm install                # postinstall runs `prisma generate` automatically
npm run db:up               # start local Postgres in Docker (container keichi-pg, port 5433)
npm run db:push:local       # sync prisma/schema.prisma to the LOCAL db
npm run db:seed:local       # seed demo accounts + agent templates into the LOCAL db
npm run dev                 # http://localhost:3000
npm run build                # prisma generate && next build
npm run lint                 # ESLint (no test suite exists in this repo)
npm run db:reset:local       # docker compose down -v → up → push:local → seed:local
npm run db:studio:local      # Prisma Studio on the LOCAL db (http://localhost:5555)
npm run email:test           # send a test email via Resend (scripts/test-email.ts)
```

**Critical rule: always use the `:local` suffixed db scripts during development.** The un-suffixed `db:push` / `db:seed` / `db:studio` read `.env`'s connection string, which is the **production Zeabur database**. There is no staging environment — `:local` vs bare is the only thing standing between you and the live school database.

First-time setup: `cp .env .env.local` then edit `DATABASE_URL`/`DATABASE_URL_UNPOOLED` to point at `localhost:5433`, and `AUTH_URL`/`NEXT_PUBLIC_APP_URL` to `localhost:3000` (full instructions: `docs/local-dev.md`). Seed logins: `admin@demo.hk` / `teacher@demo.hk` / `student@demo.hk`, password `<role>123`, via the credentials form on `/login` (Google OAuth only works against the deployed domain).

Requires Docker Desktop running for the local Postgres container; `npm run dev` does not start it for you.

## Architecture

**Stack**: Next.js 14 App Router + TypeScript, NextAuth v5 (Google Workspace SSO + credentials/bcrypt), PostgreSQL + Prisma 6 (40+ models in `prisma/schema.prisma`), Pusher Channels (cluster `ap3`) for realtime, Tailwind, Resend for transactional email, deployed to Zeabur HK-1 (student data must stay in Hong Kong per 《私隱條例》).

### The Keida agent system

The centerpiece: a multi-agent assistant reachable from a FAB on every page (`src/app/api/agents/chat/route.ts`). Charters (personas + routing rules, in Cantonese) live as plain markdown in `prompts/agents/`, loaded and cached by `src/lib/agents.ts`:

- **A01 統籌 Dispatcher** — reads intent, asks at most one clarifying question, then emits `[ROUTE:x]` to hand off. Never answers directly.
- **A02 Ada** (課程 curriculum), **A03 Ethan** (試卷 exams), **A04 Carla** (教材 materials/flashcards), **A05 Andy** (校務 admin: substitutions, timetable gaps, notices, procurement, todos/announcements/calendar/behavior), **A06 Donna** (數據 data analysis).

Marker protocol parsed by `src/lib/agents.ts` / consumed in the chat route:
- `[ROUTE:agentKey]` — dispatcher → specialist handoff.
- `[NEED_TOOL:name]{json}` — specialist requests a tool call; tools are catalogued in `src/lib/tool-registry.ts` and `src/lib/agent-tools.ts`, executed server-side, result fed back to the model.
- `[DRAFT:kind]{json}` — specialist proposes a record (`todo`/`announcement`/`calendar`/`activity`/`flashcard_deck`/`behavior`) as a confirm-card in the UI. **The LLM never writes to the database directly** — only an authenticated POST after the teacher clicks 確認 does. Preserve this invariant in anything you add.
- `[DOCREADY]` / `[NEEDS_APPROVAL]` / `[TITLE:...]` — a specialist has produced a document (stored in `AgentDocument`) that needs human sign-off, tracked via `AgentAuditLog`.

Conversations persist in `AgentConversation`/`AgentMessage`; there is currently no cross-conversation memory or retrieval — each conversation starts cold, and Ask ICHI (`src/app/api/ai/query/route.ts`) just stuffs the last ~30 announcements/behavior-records into context rather than doing real retrieval. This is the biggest known architectural gap — see `AGENT_HANDOFF.md` Phase 2.

### LLM provider layer (`src/lib/llm.ts`)

Runtime-switchable between `anthropic` / `openrouter` / `local` (self-hosted OpenAI-compatible, e.g. Ollama), selected by an admin at 系統設定 and stored in `SchoolSetting` (secrets stay in env vars, never in the DB). `streamLLM()`/`completeLLM()` are the only entry points call sites should use — don't call the Anthropic SDK directly outside this file. Separately, `src/lib/claude.ts` hardcodes Anthropic-only calls for the two teaching-side AI features (`generateQuiz` on Sonnet, `evaluatePrompt` on Haiku) — these predate the provider-switchable layer and haven't been migrated onto it.

### Auth & permissions

Three roles (`Role`: STUDENT/TEACHER/ADMIN via NextAuth session). `src/lib/roles.ts` centralizes checks: `isTeacherOrAdmin`, `isAdmin`, and `canEditCommittee` (global ADMIN or the committee's `CommitteeRole.isChair`). Emails in `ADMIN_EMAILS` (env) are always granted ADMIN on login, plus one hardcoded bootstrap admin in code.

### Notifications & realtime

Pusher private channels (`src/lib/pusher.ts` server-side broadcast helpers, `src/lib/pusher-client.ts` client). Historically wired only into the student dashboard; teacher-side notifications (bell + `Notification` model) are newer — check `ROADMAP.md`/`AGENT_HANDOFF.md` for current coverage before assuming an event fires a notification.

### Schema-change safety (matters more than usual — no staging environment)

| Change | Safe? |
|---|---|
| Add nullable field / field with default | ✅ zero downtime |
| Add model | ✅ |
| Rename field | ⚠️ deploy client + push schema together |
| Remove field | ⚠️ remove all usages first, push later |
| Remove model | ⚠️ drops the table and its data |

Full deploy procedure (Zeabur env vars, OAuth redirect URIs, `prisma db push` after schema changes since Zeabur doesn't run it automatically): `DEPLOY.md`.

### Obsidian logging caveat

`src/lib/obsidian-log.ts` → `scripts/save_to_obsidian.js` fire-and-forget writes agent activity to a **hardcoded local OneDrive vault path**. This only works on the original developer's machine — it silently no-ops in any other environment, including production. Don't rely on it as a real audit trail; `AgentAuditLog` in the DB is the actual source of truth.

## Known model-ID drift

`llm.ts` and `claude.ts` reference specific model IDs (e.g. `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) and `voyage-3.5` is planned for future embeddings. These go stale — verify current model IDs/pricing before editing either file.
