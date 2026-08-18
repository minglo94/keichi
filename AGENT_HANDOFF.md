# AGENT_HANDOFF.md — Keichi EduPortal 分階段工作指令

> **Purpose:** Work order for any agent (Claude Code session, subagent, or teammate) picking up this codebase.
> Strategic overview lives in the Obsidian vault: `School\Keichi EduPortal — Review & Feasible Plan 2026-07-15.md`
> and `Agentic OS — All Projects Review & Work Orders 2026-07-15.md`.
> Master architecture reference: `Downloads\AI 指揮中心 · Agentic OS Blueprint｜一人公司 (1).md` (4-layer Agentic OS).
>
> ⚠️ **Revision note (2026-07-15b):** An earlier draft of this file, and the repo's own `ROADMAP.md`, described
> agent-document-viewer, audit-log-viewer, and teacher-notifications as *missing*. They are not — verified
> directly against the code: `src/app/teacher/admin/audit/page.tsx`, `src/app/teacher/agents/documents/[id]/page.tsx`,
> `src/components/teacher/NotificationBell.tsx`, `src/app/api/notifications/route.ts` all exist and correspond to
> real merged commits (`020b90f`, `f582e58`). **`ROADMAP.md` is a stale planning snapshot from 2026-06-17 — it was
> never updated as items got built.** `TODO/DONE.md` is more reliable: it tracks `TODO/ALL.md` item-by-item and is
> current. **Lesson for future agents: verify claims in ROADMAP.md / planning docs against actual files and `git log`
> before treating them as current state — do not trust a planning doc's "todo" framing at face value.**
>
> This repo is connected to a real, live GitHub remote (`git@github.com:minglo94/keichi.git`) with an actively
> maintained `main` branch that **auto-deploys to Zeabur on push** (per `DEPLOY.md`). Treat it accordingly:
> confirm before pushing, never force-push, and assume other people/agents may be working on other branches.

---

## System snapshot (verified against code + git log, not just docs)

- **Platform**: 香港中學教學+行政一體化平台 (基智若愚 ICHI). Next.js 14 App Router + TS, NextAuth v5 (Google SSO + credentials), PostgreSQL + Prisma 6 (40+ models), Pusher (ap3), Tailwind, Zeabur HK-1.
- **Teaching core**: classes/join codes, mission map with prereqs, SM-2 flashcards, points + leaderboard, AI quiz gen + prompt grading (`src/lib/claude.ts`).
- **Admin core**: announcements (priority + Google Calendar sync — implemented, see `src/app/api/google-calendar/`), todos, calendar, behavior records with discipline email thresholds (`src/lib/discipline.ts`, Resend via `src/lib/email.ts`), committee tools (IT + Admin's KCquotation/活動文件 built, some ECA/Curriculum stubs remain), assets, bookings, procurement, activities, student groups, CSV import/export, rate limiting (`src/lib/rate-limit.ts`), **agent document viewer + audit-log viewer + teacher notifications (all built)**.
- **Keida agent system**: A01 dispatcher → A02 Ada 課程 / A03 Ethan 試卷 / A04 Carla 教材 / A05 Andy 校務(時間表/代課/通告/採購) / A06 Donna 數據. Charters in `prompts/agents/*.md`; marker protocol in `src/lib/agents.ts` (`[ROUTE:]`, `[NEED_TOOL:]` → `src/lib/tool-registry.ts` + `src/lib/agent-tools.ts`, `[DRAFT:kind]` confirm-cards — LLM never writes DB, `[DOCREADY]`/`[NEEDS_APPROVAL]`); persistence in AgentConversation/AgentMessage/AgentDocument/AgentAuditLog; chat route `src/app/api/agents/chat/route.ts`.
- **LLM layer** `src/lib/llm.ts`: provider switchable at runtime (anthropic / openrouter / local Ollama) via SchoolSetting + admin page; default `claude-sonnet-4-6`. `src/lib/claude.ts` (quiz gen + prompt eval) is separately hardcoded to Anthropic and has NOT been migrated onto the switchable layer. Ask ICHI = `src/app/api/ai/query/route.ts` (context-stuffs last ~30 records — no retrieval yet — this is real and still the biggest gap, see Phase 2).
- **Obsidian hook**: `src/lib/obsidian-log.ts` → `scripts/save_to_obsidian.js` → hardcoded local path (works on the original dev machine only; silently no-ops in production — real, still needs the pull-mode fix in Phase 2d).

### Dev environment (from `docs/local-dev.md` — read it in full before touching the DB)
```bash
npm install                # postinstall runs prisma generate
npm run db:up               # local Postgres in Docker (keichi-pg, port 5433)
npm run db:push:local       # sync schema to LOCAL db (NEVER bare db:push — that hits Zeabur prod)
npm run db:seed:local
npm run dev                 # http://localhost:3000
npm run lint                 # ESLint (no test suite exists)
```
Seed logins: `admin@demo.hk`/`admin123`, `teacher@demo.hk`/`teacher123`, `student@demo.hk`/`student123` (credentials form; Google OAuth is prod-domain-only).
**Rule: always use the `:local` db scripts. The un-suffixed ones read `.env` = production Zeabur.**

Verified 2026-07-15: `npm install` (748 packages) and `npm run build` both succeed cleanly from a fresh clone (only pre-existing lint warnings — missing `useEffect` deps in 2 files, `<img>` vs `next/image` in 2 files — no errors). `next@14.2.30` has a known security advisory per npm's install-time warning; worth a version bump when convenient (not blocking).

---

## Phase 0 — Consolidation & safety

**0.1 Repo consolidation — DONE (2026-07-15).** Working copy is now `~/keichi` (this checkout), tracking the real `minglo94/keichi` remote on branch `claude/eduportal-admin-platform-r9iBw`. The old Downloads copies (`keichi-main\` and `keichi-main (1)\`, including `dazhi-full.zip`) were moved to `Downloads\_archived\` — not deleted, just out of the way.

**0.2 Secret hygiene — verified not applicable to the Downloads snapshot.** Neither Downloads copy ever contained a real `.env`, only `.env.example` with placeholder values — nothing to rotate from that source. **However**, this repo IS a live GitHub project with a production Zeabur deployment; if a real `.env` with production secrets is ever found tracked in the actual GitHub history (not verified in this session — only the Downloads snapshot was checked), that would need the standard `git rm --cached` + rotation treatment. Worth a `git log --all --full-history -- .env` check on this real repo as a follow-up.

**0.3 Replace stale CLAUDE.md — DONE (2026-07-15).** Old Sprint 0-5 spec moved to `docs/BUILD_SPEC.md`; this file replaced with one reflecting actual architecture. Note: the live GitHub repo's own `main`/`master` branches likely still have the old CLAUDE.md too (this fix has only happened locally in this checkout so far) — worth a proper PR to land it for real, rather than leaving it local-only.

---

## Phase 1 — Remaining quick items (small, independent, parallelisable)

Most of the original "ROADMAP quick wins" are already shipped (see revision note above). What's actually left:

**1.1 Bug: portfolio route** *(verified still present)*. `src/app/api/students/[id]/portfolio/route.ts` line ~38 has `where: { studentName: { contains: studentId } }` with its own inline comment questioning it ("This might be tricky if studentName is a string, let's check schema") — this matches records by substring on a name field using an id value, which is wrong. Filter by the actual student id/relation instead.
✅ Accept: portfolio returns only the target student's records (verify with two students whose names could overlap/substring-match).

**1.2 TODO/ALL.md — one item remains open** (confirmed via `TODO/DONE.md`, which is current and detailed): 「行事曆 — 新增：將活動同步至用戶外部 Google Calendar」(sync *activities*, as opposed to announcements, which are already synced per `googleEventId` on `Announcement`). Everything else in `TODO/ALL.md` is done and documented with screenshots in `TODO/DONE.md`.
✅ Accept: creating/editing an Activity with calendar-sync enabled produces a corresponding Google Calendar event, same pattern as the existing Announcement sync.

**1.3 Stub committee tools** — per `ROADMAP.md` §4, some ECA/Curriculum tools remain "即將推出" placeholders. Verify current state against the file tree before starting (this file's earlier draft was wrong about what's built — don't repeat that mistake; check `src/app/teacher/committee/` and `TOOL_REGISTRY` in `src/lib/tool-registry.ts` directly).

---

## Phase 2 — Memory / RAG layer (core value, unverified as still-needed but very likely still real — Ask ICHI's context-stuffing behavior was confirmed by direct code read)

**Design principle: retrieval is an agent TOOL** registered in `src/lib/tool-registry.ts` / `src/lib/agent-tools.ts` under the existing `[NEED_TOOL:]` protocol — one implementation serves all six agents AND Ask ICHI. Do not wire RAG ad-hoc into individual routes.

**2a. `search_school_data` FTS tool (no new infra).** Postgres full-text over Announcement / BehaviorRecord / AgentDocument / CalendarEvent / Activity / Todo. Chinese caveat: default tsvector cannot segment 繁中 — use `pg_trgm` trigram indexes (available on Zeabur) at minimum. Rewrite `api/ai/query` to retrieve-then-answer instead of stuffing the latest ~30 records.
✅ Accept: asking Ask ICHI about an announcement from 3 months ago (outside any recency window) answers correctly.

**2b. pgvector hybrid retrieval.** Enable `pgvector` on the existing Postgres; add `KnowledgeDocument` + `KnowledgeChunk` (`Unsupported("vector(1024)")`, raw-SQL cosine search — follow the schema-change safety table below). Corpus: AgentDocument bodies, teacher-uploaded materials (500–800-token chunks), SOP notes. Embeddings follow the `llm.ts` switchable-provider pattern: Voyage AI (`voyage-3.5`) on the anthropic path; local Ollama embeddings on the local path — **student-identifiable content must use the local path (私隱條例)**. Retrieval = FTS + vector rank fusion.
✅ Accept: quiz generated from a previously-uploaded document with no pasted text; hybrid beats FTS-only on a 10-query Chinese test set.

**2c. Cross-conversation memory + student learning profiles.** (i) On conversation close, Haiku writes a 3–5 sentence summary → new `AgentMemory` table; inject that teacher's recent summaries into new conversations. (ii) Nightly job aggregates `aiScore` + SM-2 `easeFactor` + points per student → strengths/weaknesses summary injected into `evaluatePrompt` feedback and Donna's class analysis.
✅ Accept: new conversation references last week's exam request unprompted; two students with different SM-2 histories get visibly different feedback.

**2d. Obsidian sync → pull mode.** Server-side `logToObsidian` breaks in production (hardcoded local path). Keep it dev-only; add a digest API endpoint (yesterday's announcements/approvals/agent docs) and a **local** scheduled Claude Code agent that pulls it into the vault `School\Medvault Logs\` each morning. Vault path: `C:\Users\CMLO\OneDrive - ccckcss\文件\Obsidian Vault\`.
✅ Accept: digest note appears in vault on a machine that never runs the server.

---

## Phase 3 — Agentic OS completion + remaining polish

- **3.1 廣東話晨報 agent**: merge school digest (2d) + InvestBot morning scans (vault `InvestBot\US\`) into one morning brief (blueprint layer ③).
- **3.2 Personal command-center dashboard** (blueprint layer ④): reads vault + school API + InvestBot outputs.
- **3.3 Migrate `src/lib/claude.ts` onto the switchable LLM layer** so quiz-gen/prompt-eval respect the admin's chosen provider like everything else does.
- **3.4 Data export**: verify current coverage (only `admin/users/export` was confirmed missing peers as of the last real check — re-verify against code, not the stale ROADMAP, before assuming gaps).
- **3.5 Student parity / polish**: PWA manifest, dark mode, aria labels, global search, onboarding/help — verify each against code first.

---

## Standing rules for all agents

1. Never run un-suffixed `db:push`/`db:seed`/`db:studio` — they target production. `:local` only.
2. LLM writes to DB only through `[DRAFT:]` confirm-cards or authenticated POSTs after human confirmation — preserve this invariant in anything you add.
3. Schema changes: add nullable/defaulted fields freely; renames and removals need a two-step deploy (see `DEPLOY.md`'s safety table) since there's no staging environment — production is the only Postgres this app talks to besides your local Docker container.
4. UI language is Traditional Chinese (廣東話書面語 for agent replies — see `prompts/agents/`); iPad-first.
5. Model IDs (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `voyage-3.5`) go stale — verify against current docs before editing `llm.ts`/`claude.ts`.
6. Student data stays in HK / on local infra where possible (Zeabur HK-1, local embeddings for Phase 2b).
7. **Verify planning-doc claims (ROADMAP.md, TODO files, this file) against actual code and `git log` before acting on them — they drift out of date and this file itself was wrong about Phase 1 in its first draft.**
8. This repo has a real, live GitHub remote with an auto-deploying `main`. Never push without explicit confirmation from the user; never force-push.
9. When you complete a phase item, tick it here and log a note to the Obsidian vault (`School\Medvault Logs\`).
