/**
 * POST /api/cron/build-student-profiles
 *
 * Rebuilds StudentLearningProfile for every student. Meant to be hit by an
 * external scheduler (this codebase has no in-process job runner) — e.g.
 * a nightly cron on Zeabur, or the local `/schedule` Claude Code routine.
 * Deterministic computation (no LLM call), so re-running often is cheap.
 *
 * Auth: shared-secret header, since this has no interactive user session.
 * Set CRON_SECRET in env and send it as `x-cron-secret`.
 */
import { NextRequest, NextResponse } from "next/server"
import { refreshAllStudentProfiles } from "@/lib/student-profile"

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const count = await refreshAllStudentProfiles()
  return NextResponse.json({ refreshed: count })
}
