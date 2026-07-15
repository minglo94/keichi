// ============================================================
// Email Service (Resend)
// Central server-side email client + typed send helper.
// Other modules import sendEmail() — never touch the SDK directly.
//
// Setup & production (domain) checklist: docs/email-service.md
// Future extension points (batch / schedule / webhook): bottom of file.
// ============================================================
import { Resend } from 'resend'
import type { ReactElement } from 'react'

const DEFAULT_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev'

// Singleton — reused across hot-reloads in dev (mirrors pusher.ts)
const globalForResend = globalThis as unknown as { resend?: Resend }

function createResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!globalForResend.resend) {
    globalForResend.resend = new Resend(apiKey)
  }
  return globalForResend.resend
}

export const resend = createResend()

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface SendEmailParams {
  to: string | string[]
  subject: string
  /** A React Email template element, e.g. <WelcomeEmail {...props} /> */
  react?: ReactElement
  /** Raw HTML body (fallback when react is not used) */
  html?: string
  /** Plain text body */
  text?: string
  /** Override the default sender (otherwise RESEND_FROM env) */
  from?: string
  replyTo?: string
  bcc?: string | string[]
  /** Up to 5 tags for analytics/tracking */
  tags?: { name: string; value: string }[]
}

export interface SendEmailResult {
  /** Resend message id, or 'skipped' when the send was a no-op */
  id: string
  /** true when RESEND_API_KEY was unset and the send was skipped */
  skipped?: boolean
}

// Legacy alias for callers using the old fetch-based API
export type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
}

// ─────────────────────────────────────────
// Core send function
// ─────────────────────────────────────────

/**
 * Send a transactional email via Resend.
 *
 * Gracefully no-ops when RESEND_API_KEY is unset, so features that call it
 * keep working in environments (local dev, PR previews) without email set up.
 * Configure RESEND_API_KEY + RESEND_FROM to enable real delivery.
 *
 * Supports React Email templates (react) and raw html/text bodies.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, react, html, text, from = DEFAULT_FROM, replyTo, bcc, tags } = params

  if (!resend) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[email] RESEND_API_KEY not set — skipping send (production)')
    } else {
      console.info(`[email] (dev no-op) → ${to} «${subject}»`)
    }
    return { id: 'skipped', skipped: true }
  }

  const body = react
    ? { from, to, subject, react }
    : html
      ? { from, to, subject, html }
      : { from, to, subject, text: text ?? "" }

  const { data, error } = await resend.emails.send({
    ...body,
    replyTo,
    bcc,
    tags,
  })

  if (error) {
    throw new Error(`[email] Resend error: ${error.message}`)
  }
  if (!data?.id) {
    throw new Error('[email] Resend returned no message id')
  }

  return { id: data.id }
}

/**
 * True when Resend is configured — lets the UI show whether email will work.
 * Checks both env vars that configure the SDK.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

// ─────────────────────────────────────────────────────────────────
// FUTURE EXTENSION POINTS — NOT wired in yet (v1 = single send only).
// When a feature needs one, reach for the raw `resend` client above
// and add a typed helper here (keep callers off the SDK).
// API names verified against resend@6.17.2. See docs/email-service.md.
// ─────────────────────────────────────────────────────────────────

// 1. BATCH — one call, up to 100 recipients, each with unique content.
//    Use case: notify a whole class at once instead of looping sendEmail().
//
//    await resend?.batch.send(students.map(s => ({
//      from, to: s.email, subject, react: <WelcomeEmail ... />,
//    })), { idempotencyKey: `welcome-${cls.id}` })

// 2. SCHEDULED — deliver at a future time (ISO 8601, must be future).
//    Use case: flashcard review reminder for tomorrow morning.
//    Reschedule/cancel before it fires:
//      resend.emails.update({ id, scheduledAt: '...' })
//      resend.emails.cancel(id)
//
//    await resend?.emails.send({
//      from, to, subject, react: <ReminderEmail />,
//      scheduledAt: '2026-08-01T09:00:00+08:00',
//    })

// 3. WEBHOOKS — receive delivery events to act on them.
//    Add a route at /api/email/webhook, verify the Resend webhook signature,
//    then drive a bounce blacklist / engagement metrics.
//    Events: 'sent' | 'delivered' | 'bounced' | 'complained'
//          | 'opened' | 'clicked' | 'failed'

// 4. CONTACTS / AUDIENCES / BROADCASTS — MARKETING only.
//    resend.contacts.create({ email, firstName, lastName })
//    resend.broadcasts.create({...}).then(b => resend.broadcasts.send(b.id))
//    ❗ NOT needed for sendEmail() above — transactional sends can target
//    any address once the sender DOMAIN is verified. Do NOT add students
//    to Resend to "enable" sending.
