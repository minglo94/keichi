import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { loadRoster } from "@/lib/classroom-roster"
import { loadReview, parseFilter } from "@/lib/lesson-review"
import { RECORD_LABEL, type LessonRecordKindValue } from "@/lib/lesson-records"
import { hkYmd } from "@/lib/hk-date"
import { toCsv } from "@/lib/csv"

// Free text (notes, tags, homework titles — the last typed by student reps in
// Phase 3) must not start a cell with = + @ or a tab, or Excel runs it as a
// formula when a teacher opens the file. Signed numbers like "-1" are left alone.
const safe = (s: string | null | undefined) => {
  const v = s ?? ""
  return /^[=+@\t\r]/.test(v) || /^-[^\d]/.test(v) ? `'${v}` : v
}

// GET — the same 回顧 filter as the screen, as CSV (BOM included, so Excel
// opens the Chinese correctly).
export async function GET(req: NextRequest, { params }: { params: { classId: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate

  const filter = parseFilter(gate.cls.id, new URL(req.url).searchParams)
  const [records, roster] = await Promise.all([loadReview(filter), loadRoster(gate.cls.id, gate.cls.name)])
  const tagOf = new Map(roster.map((r) => [r.id, r.tag]))

  const csv = toCsv(
    ["日期", "節", "科目", "學號", "學生", "類別", "標籤", "功課", "備註", "分數", "積點已發放", "已跟進", "記錄老師"],
    records.map((r) => [
      hkYmd(r.date),
      r.session?.periodLabel ?? (r.period ? `第${r.period}節` : ""),
      r.subject ?? "",
      tagOf.get(r.studentId) ?? "",
      safe(r.student.name ?? r.student.nameEn),
      RECORD_LABEL[r.kind as LessonRecordKindValue],
      safe(r.tag),
      safe(r.homework?.title),
      safe(r.note),
      r.kind === "PERFORMANCE" ? String(r.points) : "",
      r.kind === "PERFORMANCE" ? (r.awardedAt ? "是" : "否") : "",
      r.resolved ? "是" : "",
      r.author?.name ?? "",
    ]),
  )

  const filename = `${gate.cls.name}課堂紀錄_${hkYmd()}.csv`
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="records.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
