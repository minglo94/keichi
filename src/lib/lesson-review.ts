import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { hkDayStart, hkSchoolYear, hkYmd } from "@/lib/hk-date"
import { RECORD_KINDS, type LessonRecordKindValue } from "@/lib/lesson-records"

// The 回顧 query, shared by the screen and the CSV export so the two can never
// disagree about what "this term's 欠交功課 for 3A" means.

export type ReviewFilter = {
  classId:     string
  from?:       string | null   // YYYY-MM-DD (HK); default: start of this school year
  to?:         string | null   // YYYY-MM-DD (HK), inclusive; default: today
  kind?:       string | null
  studentId?:  string | null
  unresolved?: boolean
}

export function reviewWhere(f: ReviewFilter): Prisma.LessonRecordWhereInput {
  const from = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? hkDayStart(f.from) : hkSchoolYear().start
  const toYmd = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? f.to : hkYmd()
  const to = new Date(hkDayStart(toYmd).getTime() + 24 * 3600_000) // inclusive day → exclusive bound
  const kind = RECORD_KINDS.includes(f.kind as LessonRecordKindValue) ? (f.kind as LessonRecordKindValue) : undefined
  return {
    classId: f.classId,
    date: { gte: from, lt: to },
    ...(kind ? { kind } : {}),
    ...(f.studentId ? { studentId: f.studentId } : {}),
    ...(f.unresolved ? { resolved: false } : {}),
  }
}

export async function loadReview(f: ReviewFilter) {
  return prisma.lessonRecord.findMany({
    where: reviewWhere(f),
    select: {
      id: true, kind: true, date: true, period: true, subject: true, tag: true, note: true,
      points: true, awardedAt: true, resolved: true, resolvedAt: true, createdAt: true,
      studentId: true,
      student:  { select: { id: true, name: true, nameEn: true } },
      session:  { select: { id: true, period: true, periodLabel: true, subject: true, seq: true, startedAt: true } },
      homework: { select: { id: true, title: true } },
      author:   { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 3000,
  })
}

export function parseFilter(classId: string, sp: URLSearchParams): ReviewFilter {
  return {
    classId,
    from: sp.get("from"), to: sp.get("to"), kind: sp.get("kind"),
    studentId: sp.get("studentId"), unresolved: sp.get("unresolved") === "1",
  }
}
