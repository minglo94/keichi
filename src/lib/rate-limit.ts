import { prisma } from "@/lib/prisma"

export type RateLimitResult = {
  allowed:   boolean
  remaining: number
  resetAt:   Date
}

/**
 * Fixed-window rate limiter backed by the RateLimit table so it works across
 * serverless instances (Zeabur) where in-memory counters don't persist.
 *
 * @param key      Unique bucket key, e.g. `login:${email}:${ip}` or `ai:${userId}`.
 * @param limit    Max requests allowed per window.
 * @param windowMs Window length in milliseconds.
 *
 * Fails OPEN: if the DB is unreachable, requests are allowed rather than
 * locking everyone out (availability over strictness for a school tool).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date()

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } })

    // No record, or the window has expired → start a fresh window at count 1.
    if (!existing || now.getTime() - existing.windowStart.getTime() >= windowMs) {
      await prisma.rateLimit.upsert({
        where:  { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      })
      return { allowed: true, remaining: limit - 1, resetAt: new Date(now.getTime() + windowMs) }
    }

    const resetAt = new Date(existing.windowStart.getTime() + windowMs)

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0, resetAt }
    }

    const updated = await prisma.rateLimit.update({
      where: { key },
      data:  { count: { increment: 1 } },
    })
    return { allowed: true, remaining: Math.max(0, limit - updated.count), resetAt }
  } catch (err) {
    console.error("rate-limit check failed (failing open):", err)
    return { allowed: true, remaining: limit, resetAt: new Date(now.getTime() + windowMs) }
  }
}

/**
 * Per-user AI quota. Students get a tighter cap than staff to prevent
 * API-cost abuse. Returns null if allowed, or a ready-to-send 429 payload.
 */
export async function aiRateLimit(
  userId: string,
  role: string | undefined,
  bucket: string
): Promise<{ status: 429; body: object; headers: Record<string, string> } | null> {
  const limit = role === "STUDENT" ? 30 : 120 // requests per hour
  const rl = await checkRateLimit(`ai:${bucket}:${userId}`, limit, 60 * 60 * 1000)
  if (rl.allowed) return null
  const { body, headers } = rateLimitResponse(rl.resetAt, "AI 使用太頻繁，請稍後再試。")
  return { status: 429, body, headers }
}

/** Build a 429 JSON response body + headers for a blocked request. */
export function rateLimitResponse(resetAt: Date, message = "操作太頻繁，請稍後再試。") {
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
  return {
    body:    { error: message, code: "RATE_LIMITED", retryAfter },
    headers: { "Retry-After": String(retryAfter) },
  }
}
