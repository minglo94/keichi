import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pdSession } from "@/lib/pd-auth"
import { z } from "zod"

// 節次時間 / 非上課日 / 行政文件連結 — all three settings in one endpoint,
// since they are edited together on the 設定 tab.

export async function GET() {
  const session = await pdSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [periods, nonTeaching, docs] = await Promise.all([
    prisma.schoolPeriod.findMany({ orderBy: [{ period: "asc" }, { startTime: "asc" }] }),
    prisma.nonTeachingPeriod.findMany({ orderBy: { startDate: "asc" } }),
    prisma.adminDocLink.findMany({ orderBy: { order: "asc" } }),
  ])
  return NextResponse.json({ periods, nonTeaching, docs })
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/

const schema = z.object({
  // A row is either a numbered lesson or a named slot (早會/周會), never both.
  periods: z.array(z.object({
    period:    z.number().int().min(1).max(10).nullable().optional(),
    label:     z.string().max(20).nullable().optional(),
    startTime: z.string().regex(HHMM),
    endTime:   z.string().regex(HHMM),
  }).refine((p) => p.period != null || !!p.label?.trim(), {
    message: "節次必須有節數或名稱",
  })).optional(),
  nonTeaching: z.array(z.object({
    name:      z.string().min(1).max(100),
    type:      z.enum(["HOLIDAY", "EXAM", "EVENT"]),
    startDate: z.string(),
    endDate:   z.string(),
    freeFrom:  z.string().regex(HHMM).nullable().optional(),
  })).optional(),
  docs: z.array(z.object({
    label: z.string().min(1).max(100),
    url:   z.string().url().max(500),
  })).optional(),
})

// PUT — replace whole sections. Simpler than per-row CRUD for small config
// lists, and the UI edits them as a whole anyway.
export async function PUT(req: NextRequest) {
  const session = await pdSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const d = schema.parse(await req.json())

  if (d.periods) {
    await prisma.$transaction([
      prisma.schoolPeriod.deleteMany({}),
      prisma.schoolPeriod.createMany({
        data: d.periods.map((p) => ({
          period:    p.period ?? null,
          label:     p.period != null ? null : (p.label?.trim() || null),
          startTime: p.startTime,
          endTime:   p.endTime,
        })),
      }),
    ])
  }
  if (d.nonTeaching) {
    await prisma.$transaction([
      prisma.nonTeachingPeriod.deleteMany({}),
      prisma.nonTeachingPeriod.createMany({
        data: d.nonTeaching.map((n) => ({
          name: n.name, type: n.type,
          startDate: new Date(`${n.startDate}T00:00:00+08:00`),
          endDate:   new Date(`${n.endDate}T23:59:59+08:00`),
          freeFrom:  n.type === "EXAM" ? (n.freeFrom ?? null) : null,
        })),
      }),
    ])
  }
  if (d.docs) {
    await prisma.$transaction([
      prisma.adminDocLink.deleteMany({}),
      prisma.adminDocLink.createMany({
        data: d.docs.map((x, i) => ({ label: x.label, url: x.url, order: i })),
      }),
    ])
  }

  return NextResponse.json({ ok: true })
}
