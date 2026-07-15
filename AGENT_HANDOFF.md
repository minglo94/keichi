# AGENT_HANDOFF.md — Keichi EduPortal 分階段工作指令

> **Purpose:** Work order for any agent (Claude Code session, subagent, or teammate) picking up this codebase.
> Produced from the full system review on 2026-07-15. Strategic overview lives in the Obsidian vault:
> `School\Keichi EduPortal — Review & Feasible Plan 2026-07-15.md`. Master architecture reference:
> `Downloads\AI 指揮中心 · Agentic OS Blueprint｜一人公司 (1).md` (4-layer Agentic OS).
>
> ⚠️ The `CLAUDE.md` in this repo is the ORIGINAL Sprint 0–5 build spec and is badly outdated
> (predates the Keida agent system and ~30 of the 40+ Prisma models). Trust this file, `ROADMAP.md`,
> `dazhi.md`, `docs/local-dev.md`, and the code itself — not `CLAUDE.md` — until Phase 0.3 replaces it.

---

## System snapshot (what exists today)

- **Platform**: 香港中學教學+行政一體化平台 (基智若愚 ICHI). Next.js 14 App Router + TS, NextAuth v5 (Google SSO + credentials), PostgreSQL + Prisma 6 (40+ models), Pusher (ap3), Tailwind, Zeabur HK-1.
- **Teaching core**: classes/join codes, mission map with prereqs, SM-2 flashcards, points + leaderboard, AI quiz gen + prompt grading (`src/lib/claude.ts`).
- **Admin core**: announcements (priority + Google Calendar sync), todos, calendar, behavior records with discipline email thresholds (Resend, `src/lib/email.ts`), committee tools (IT complete, 9 stubs), assets, bookings, procurement, activities, student groups, CSV import/export, rate limiting (`src/lib/rate-limit.ts`).
- **Keida agent system**: A01 dispatcher → A02 Ada 課程 / A03 Ethan 試卷 / A04 Carla 教材 / A05 Andy 校務(時間表/代課/通告/採購) / A06 Donna 數據. Charters in `prompts/agents/*.md`; marker protocol in `src/lib/agents.ts` (`[ROUTE:]`, `[NEED_TOOL:]` → `src/lib/tool-registry.ts`, `[DRAFT:kind]` confirm-cards — LLM never writes DB, `[DOCREADY]`/`[NEEDS_APPROVAL]`); persistence in AgentConversation/AgentMessage/AgentDocument/AgentAuditLog; chat route `src/app/api/agents/chat/route.ts`.
- **LLM layer** `src/lib/llm.ts`: provider switchable at runtime (anthropic / openrouter / local Ollama) via SchoolSetting + admin page; default `claude-sonnet-4-6`. Ask ICHI = `src/app/api/ai/query/route.ts` (context-stuffs last 30 records — no retrieval yet).
- **Obsidian hook**: `src/lib/obsidian-log.ts` → `scripts/save_to_obsidian.js` → hardcoded local path `C:\Users\CMLO\OneDrive - ccckcss\文件\Obsidian Vault\School\Medvault Logs` (works on dev machine only; silently no-ops in production).

### Dev environment (from `docs/local-dev.md` — read it in full before touching the DB)
```bash
npm install                # postinstall runs prisma generate
npm run db:up              # local Postgres in Docker (keichi-pg, port 5433)
npm run db:push:local      # sync schema to LOCAL db (NEVER bare db:push — that hits Zeabur prod)
npm run db:seed:local
npm run dev                # http://localhost:3000
npm run lint               # ESLint (no test suite exists)
```
Seed logins: `admin@demo.hk`/`admin123`, `teacher@demo.hk`/`teacher123`, `student@demo.hk`/`student123` (use the credentials form; Google OAuth is prod-only).
**Rule: always use the `:local` db scripts. The un-suffixed ones read `.env` = production Zeabur.**

---

## Phase 0 — Consolidation & safety (do FIRST, blocks everything else)

**0.1 Repo consolidation.** This copy (`Downloads\keichi-main (1)\keichi-main`) is authoritative. Move it to `~/keichi`, `git init` if no history, commit baseline, push to a private GitHub remote. Archive/delete `Downloads\keichi-main\` (older divergent copy) and `dazhi-full.zip` so no one edits the wrong tree again.
✅ Accept: `npm run build` passes from the new location; `git log` shows baseline; old copies gone or clearly marked archived.

**0.2 Secret hygiene (HIGH PRIORITY).** Per `docs/local-dev.md` §8, `.env` is git-tracked and contains PRODUCTION secrets (DB password, `ANTHROPIC_API_KEY`, OAuth secret, Resend key). `git rm --cached .env`, add to `.gitignore`, then **rotate every key it contained** before the repo is pushed anywhere. Do this before 0.1's push.
✅ Accept: `git ls-files | grep .env` empty; new keys verified working via `npm run dev` + `npm run email:test`.

**0.3 Replace stale CLAUDE.md.** Move the current file to `docs/BUILD_SPEC.md` (historical value). Write a new `CLAUDE.md`: dev commands above, the `:local` DB rule, architecture pointers (Keida marker protocol, llm.ts provider switch, schema-change safety table from `DEPLOY.md`), and a warning that `dazhi.md`/`ROADMAP.md` carry the current feature map.
✅ Accept: new CLAUDE.md contains no claims contradicted by the code.

---

## Phase 1 — ROADMAP quick wins (~1 week, independent tasks, parallelisable)

Full context in `ROADMAP.md`. Each task is self-contained and safe to hand to a separate agent.

**1.1 Agent document viewer + download** *(small — pure wiring)*. Agents generate documents into `AgentDocument.content` but nothing renders them; approvers sign blind. Build `src/app/api/agents/doc/[id]/route.ts` (GET, owner-or-admin scoped), a viewer page reusing the existing `src/components/teacher/AgentMarkdown.tsx`, a 「下載 .md」 Blob button (pattern: IT HEIC/PDF tools), and inline body in the approval card at `src/app/teacher/admin/agents/page.tsx`.
✅ Accept: teacher asks Ethan for a quiz → opens the produced doc → downloads it; approver sees full body before approving.

**1.2 Audit-log viewer** *(small — data already persisted)*. Admin page listing `AgentAuditLog` with user/action/date filters.
✅ Accept: every agent action from a test conversation appears, filterable.

**1.3 Teacher notifications** *(medium)*. Pusher is student-only today. Fire events on announcement/doc-approval/behavior-record via existing `src/lib/pusher.ts` helpers; bell + unread count in `TeacherSidebar` backed by the `Notification` model; optional Resend digest via `src/lib/email.ts`.
✅ Accept: second teacher sees notification <500ms after an announcement posts.

**1.4 Bug: portfolio route.** `src/app/api/students/[id]/portfolio/route.ts` filters `studentName: { contains: studentId }` — wrong records match. Filter by id/relation.
✅ Accept: portfolio returns only the target student's records (verify with two students whose names overlap).

**1.5 Clear `TODO/ALL.md`** (screenshots in `TODO/img/`): discipline email trigger on behavior-record create (bind class-teacher email in 班級分組), group-management rendering fix for admins, 「學生分組」→「班級分組」rename + staff binding, logo 「ICHI」 text removal, hide 公告/活動管理/任務管理/績點 entries, Google Calendar sync for 行事曆 events.
✅ Accept: each item checked off in `TODO/ALL.md` and moved to `TODO/DONE.md`.

---

## Phase 2 — Memory / RAG layer (core value, 1–2 weeks, sequential 2a→2c; 2d parallel)

**Design principle: retrieval is an agent TOOL** registered in `src/lib/tool-registry.ts` under the existing `[NEED_TOOL:]` protocol — one implementation serves all six agents AND Ask ICHI. Do not wire RAG ad-hoc into individual routes.

**2a. `search_school_data` FTS tool (no new infra).** Postgres full-text over Announcement / BehaviorRecord / AgentDocument / CalendarEvent / Activity / Todo. Chinese caveat: default tsvector cannot segment 繁中 — use `pg_trgm` trigram indexes (available on Zeabur) at minimum. Rewrite `api/ai/query` to retrieve-then-answer instead of stuffing the latest 30 records.
✅ Accept: asking Ask ICHI about an announcement from 3 months ago (outside any recency window) answers correctly.

**2b. pgvector hybrid retrieval.** Enable `pgvector` on the existing Postgres; add `KnowledgeDocument` + `KnowledgeChunk` (`Unsupported("vector(1024)")`, raw-SQL cosine search — follow the schema-change safety table in `DEPLOY.md`). Corpus: AgentDocument bodies, teacher-uploaded materials (500–800-token chunks), SOP notes. Embeddings follow the `llm.ts` switchable-provider pattern: Voyage AI (`voyage-3.5`) on the anthropic path; local Ollama embeddings on the local path — **student-identifiable content must use the local path (私隱條例)**. Retrieval = FTS + vector rank fusion. Upgrade quiz gen: teacher picks a topic → chunks retrieved automatically → no more pasting source text.
✅ Accept: quiz generated from a previously-uploaded document with no pasted text; hybrid beats FTS-only on a 10-query Chinese test set.

**2c. Cross-conversation memory + student learning profiles.** (i) On conversation close, Haiku writes a 3–5 sentence summary → new `AgentMemory` table; inject that teacher's recent summaries into new conversations. (ii) Nightly job aggregates `aiScore` + SM-2 `easeFactor` + points per student → strengths/weaknesses summary injected into `evaluatePrompt` feedback and Donna's class analysis. Add prompt caching for agent charters (anthropic path only).
✅ Accept: new conversation references last week's exam request unprompted; two students with different SM-2 histories get visibly different feedback.

**2d. Obsidian sync → pull mode.** Server-side `logToObsidian` breaks in production (hardcoded local path). Keep it dev-only; add a digest API endpoint (yesterday's announcements/approvals/agent docs) and a **local** scheduled Claude Code agent that pulls it into the vault `School\Medvault Logs\` each morning. Vault path memory: `C:\Users\CMLO\OneDrive - ccckcss\文件\Obsidian Vault\`.
✅ Accept: digest note appears in vault on a machine that never runs the server.

---

## Phase 3 — Agentic OS completion + medium ROADMAP items (after Phase 2)

- **3.1 廣東話晨報 agent**: merge school digest (2d) + InvestBot morning scans (vault `InvestBot\US\`) into one morning brief (blueprint layer ③).
- **3.2 Personal command-center dashboard** (blueprint layer ④): reads vault + school API + InvestBot outputs.
- **3.3 Stub committee tools** (9 of 23): prefer wiring to Keida generation (Andy handles 採購/通告 already) over building standalone pages — see ROADMAP §4 table for the list.
- **3.4 Data export**: CSV/PDF for behavior records, points, activities, attendance (reuse Excel-copy + Blob patterns). Student portfolio PDF per `IMPLEMENTATION_STRATEGY.md` §3.
- **3.5 Student parity**: read-only 「我的記錄」 page (high value, low risk).
- **3.6 Polish batch**: PWA manifest, dark mode, aria labels, global search, onboarding/help, visible error states, soft-delete (`deletedAt`).

---

## Standing rules for all agents

1. Never run un-suffixed `db:push`/`db:seed`/`db:studio` — they target production. `:local` only.
2. LLM writes to DB only through `[DRAFT:]` confirm-cards or authenticated POSTs after human confirmation — preserve this invariant in anything you add.
3. Schema changes follow the safety table in `DEPLOY.md` (nullable-first, two-step renames/removals).
4. UI language is Traditional Chinese (廣東話書面語 for agent replies — see charter style in `prompts/agents/`); iPad-first.
5. Model IDs (`claude-sonnet-4-6`, `claude-haiku-4-5`, `voyage-3.5`) go stale — verify against current docs before editing `llm.ts`/`claude.ts`.
6. Student data stays in HK / on local infra where possible (Zeabur HK-1, local embeddings).
7. When you complete a phase item, tick it here and log a note to the Obsidian vault (`School\Medvault Logs\`).
