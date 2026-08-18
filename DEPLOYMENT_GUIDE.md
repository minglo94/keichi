# Deployment Guide — Phase 2 RAG / Memory Layer

Covers deploying the work on branch `claude-memory-layer`: `search_school_data` (trigram search),
the pgvector knowledge base, cross-conversation memory, student learning profiles, and the
Obsidian digest endpoint. **None of this has been run against a live database** — this sandbox
had no Docker/Postgres access. Everything here was verified with `prisma validate`, `prisma
generate`, and three full `next build` passes (clean compile + typecheck), which catches syntax
and type errors but **not** runtime SQL correctness. Test locally before merging to `main`
(which auto-deploys to Zeabur on push — see `DEPLOY.md`).

---

## 1. Local verification (do this first, before anything else)

```bash
npm install
npm run db:up              # local Postgres in Docker (keichi-pg, port 5433)
npm run db:push:local      # applies the new schema — THIS IS THE FIRST REAL TEST
npm run dev
```

`db:push:local` is the step most likely to surface a problem — it's the first time the
`previewFeatures = ["postgresqlExtensions"]`, `extensions = [pg_trgm, vector]`, and the 14 raw
`gin_trgm_ops`/vector-typed fields actually get sent to a real Postgres. If it fails, the error
will point at the specific index/column — most likely candidates: the `vector` extension not
being installable on your Postgres image (needs pgvector compiled in — the official
`pgvector/pgvector` Docker image has it; check what `docker-compose.yml` currently points at),
or a typo in one of the raw SQL blocks in `src/lib/knowledge-base.ts` / `src/lib/agent-search.ts`.

### Manual smoke tests once `npm run dev` is up

1. **Ask ICHI retrieval** (`search_school_data` / Phase 2a): create an announcement, then ask
   Ask ICHI about it by a keyword from its title — confirm it answers correctly, then confirm
   asking about something from *before* the 14-day recency window still works (the whole point
   of this phase).
2. **Keida `search_school_data` tool**: ask Andy something like "上次 XXX 個通告講咩" and confirm
   `[NEED_TOOL:search_school_data]` fires and returns a sensible result.
3. **Knowledge base indexing**: generate any document via Keida (e.g. ask Ethan for a quiz),
   then check `KnowledgeChunk` rows exist via `npm run db:studio:local` — confirms
   `indexDocument()` fired and chunking worked. If `VOYAGE_API_KEY` isn't set locally, chunks will
   have `embedding = NULL` (expected — indexing continues without failing) — FTS-only retrieval
   should still work.
4. **generate-quiz with topicQuery**: once at least one document is indexed, call
   `POST /api/ai/generate-quiz` with `{"topicQuery": "...", "count": 5}` and no `sourceText` —
   confirm it retrieves chunks and generates a real quiz instead of erroring.
5. **Cross-conversation memory**: have a full Keida exchange, confirm an `AgentMemory` row
   appears for that conversation, start a *new* conversation and confirm the specialist's system
   prompt visibly references the prior one's summary (check server logs / add a temporary debug
   log if not obvious from behavior).
6. **Student profile**: `POST /api/cron/build-student-profiles` with header
   `x-cron-secret: <your CRON_SECRET>` after a student has at least one AI-scored submission —
   confirm a `StudentLearningProfile` row appears, then submit another PROMPT-type mission as
   that student and check the AI feedback reads as personalized.
7. **Digest endpoint**: `GET /api/digest` with the same header, confirm the returned markdown
   looks right (create an announcement "yesterday" via Prisma Studio's date field to test the
   date window without waiting a real day).

---

## 2. New environment variables

Add to `.env` (Zeabur) and `.env.local` (local dev):

```bash
# Embeddings — at least one of these two paths must work for vector search
# to do anything (FTS-only retrieval degrades gracefully without either).
VOYAGE_API_KEY=""                          # console.voyageai.com — cloud embeddings (voyage-3.5)
LOCAL_EMBEDDING_MODEL="nomic-embed-text"   # only used when llm_provider=local; must be served by
                                            # your LOCAL_LLM_BASE_URL server (Ollama/LM Studio)

# Shared secret for the two externally-triggered endpoints (no interactive
# session exists for a cron job or scheduled agent to authenticate with).
# Generate with: openssl rand -base64 32
CRON_SECRET=""
```

Zeabur: add both `VOYAGE_API_KEY` and `CRON_SECRET` in the dashboard's Variables tab. Rotate
`CRON_SECRET` if it's ever logged or exposed — anyone with it can trigger both cron endpoints.

---

## 3. Database migration (production)

Per `DEPLOY.md`'s safety table, this is an **additive-only** change (new models, new nullable
columns on existing models via new tables — no existing column is renamed or removed), so it's
safe as a direct `db push`, but the extensions themselves need a privileged step first:

```bash
# 1. Zeabur Terminal (or local with prod DATABASE_URL, per DEPLOY.md):
npx prisma db push
```

**If this fails on `CREATE EXTENSION vector`**: Zeabur's managed Postgres may not have pgvector
pre-installed depending on which Postgres image/version the service uses. Check Zeabur's
Postgres service settings for an extension allowlist, or whether a newer Postgres template with
pgvector baked in needs to be selected. `pg_trgm` ships with standard Postgres and should never
be the blocker — if `db push` fails, the error message will tell you which of the two extensions
failed.

### Rollback

Both new extensions and all six new/changed models are purely additive — no existing table or
column changes. If something goes wrong, the safest rollback is reverting the deployed commit
(the schema changes don't need a down-migration; nothing existing was touched) rather than trying
to manually `DROP EXTENSION`.

---

## 4. Scheduling the two new endpoints

Neither `/api/cron/build-student-profiles` nor `/api/digest` runs itself — this codebase has no
in-process job scheduler (confirmed while building this: no existing cron/queue infrastructure).
Options, in order of least to most infrastructure:

1. **Zeabur Cron** (if available on your plan) — hit both endpoints on a schedule directly.
2. **External cron service** (e.g. cron-job.org, GitHub Actions scheduled workflow) — POST/GET
   the two endpoints with the `x-cron-secret` header. Suggested schedule: student profiles
   nightly (e.g. 02:00 HKT, cheap since it's deterministic); digest each morning before school
   (e.g. 06:30 HKT) — matches the Agentic OS blueprint's 晨報 pattern.
3. **Local Claude Code `/schedule` routine** (recommended for the digest specifically, per
   `AGENT_HANDOFF.md` Phase 2d): a local scheduled agent calls `GET /api/digest`, takes the
   returned `markdown` field, and writes it as a new note into
   `C:\Users\CMLO\OneDrive - ccckcss\文件\Obsidian Vault\School\Medvault Logs\`. This is *not*
   code in this repo — set it up separately via the `/schedule` skill in a Claude Code session
   with access to that vault path.

---

## 5. Known gaps / things to revisit

- **No vector index** (HNSW/IVFFlat) declared on `KnowledgeChunk.embedding` — sequential scan is
  fine at school-scale data volumes but will degrade if the knowledge base grows large. Add
  manually once real usage shows it's needed: `CREATE INDEX ON "KnowledgeChunk" USING hnsw
  (embedding vector_cosine_ops);`
- **`isStudentData` defaults to `false`** on auto-indexed AgentDocuments (chat/route.ts) — a
  judgment call, not a verified-safe default. Revisit if any docType (e.g. individual parent
  notices from Andy) turns out to regularly contain student names, which would currently go to
  the cloud embedder (Voyage) instead of staying local.
- **`src/lib/claude.ts`'s `generateQuiz`/`evaluatePrompt` are still hardcoded to Anthropic**,
  unlike everything else in this PR which follows `llm.ts`'s switchable-provider pattern. Not
  changed here — out of scope, flagged in `AGENT_HANDOFF.md` Phase 3.
- **Chunking is character-count-based**, not a real tokenizer (no tokenizer dependency was added
  to keep this PR dependency-light) — a reasonable proxy for mixed Chinese/English text but not
  exact; if chunk sizes look wrong in practice, this is the first place to look.
