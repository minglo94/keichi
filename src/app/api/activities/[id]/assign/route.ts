import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { findClashes, windowOf } from "@/lib/clash"
import { canManageActivity } from "@/lib/activity-perm"
import { resolveRoster, splitRosterLine } from "@/lib/student-resolve"

const schema = z.object({
  studentIds:  z.array(z.string()).optional(),
  studentList: z.string().optional(), // Raw text from Excel paste
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({ where: { id: params.id } })
  if (!activity) return NextResponse.json({ error: "Activity not found" }, { status: 404 })
  // Creator, the committee's chair, or an admin — the same set that may approve
  // or delete it. Creator-only meant nobody could add students to an activity
  // the system had created on their behalf from an approved notice.
  if (!await canManageActivity(activity, session.user)) {
    return NextResponse.json({ error: "只有建立者、組別主席或管理員可指派學生" }, { status: 403 })
  }

  const { studentIds = [], studentList } = schema.parse(await req.json())
  
  let targetStudentIds = [...studentIds]

  // Resolve pasted rows through the shared resolver, so this box and the
  // 新增活動 grid match identically. It normalises class names (S4A / F.4A /
  // 4a all key to 4A) and class numbers (01 == 1), which the old inline
  // version did not — an exact `equals` on the class name meant a roster
  // written "S4A" silently resolved to nobody.
  const unmatched: { line: string; reason: string }[] = []
  if (studentList) {
    const lines = studentList.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const parsed = lines.map((line, i) => ({ id: i, line, ...splitRosterLine(line) }))
    const results = await resolveRoster(parsed)

    const resolvedIds: string[] = []
    for (const r of results) {
      if (r.matched) resolvedIds.push(r.userId)
      else unmatched.push({ line: parsed[r.id]?.line ?? "", reason: r.reason })
    }
    targetStudentIds = Array.from(new Set([...targetStudentIds, ...resolvedIds]))
  }

  if (targetStudentIds.length === 0) {
    // Nothing resolved is a result, not a success — hand back why so the UI can
    // show it instead of appearing to do nothing.
    return NextResponse.json({ assignedCount: 0, assigned: [], clashes: [], unmatched })
  }

  // Clash detection — shared helper, which unlike the previous inline query
  // also catches activities saved with a NULL endTime (SQL NULL never matched
  // the old `endTime: { gt: ... }` filter, so those were silently ignored).
  const hits = await findClashes(
    targetStudentIds,
    [windowOf(activity.startTime, activity.endTime)],
    params.id,
  )

  const nameById = new Map(
    (await prisma.user.findMany({
      where:  { id: { in: hits.map((h) => h.studentId) } },
      select: { id: true, name: true },
    })).map((u) => [u.id, u.name]),
  )

  const clashes = hits.map((h) => ({
    studentId:   h.studentId,
    studentName: nameById.get(h.studentId) ?? null,
    activity:    { id: h.activityId, title: h.title, startTime: h.startTime },
  }))

  const clashingStudentIds = new Set(clashes.map((c) => c.studentId))

  // Assign everyone
  const results = []
  for (const studentId of targetStudentIds) {
    const hasClash = clashingStudentIds.has(studentId)
    const clashInfo = clashes.find(c => c.studentId === studentId)
    
    try {
      const ass = await prisma.activityAssignment.upsert({
        where: { activityId_studentId: { activityId: params.id, studentId } },
        create: {
          activityId: params.id,
          studentId,
          status: hasClash ? "PENDING" : "CONFIRMED",
          note:   hasClash ? `時間衝突：與「${clashInfo?.activity.title}」重疊` : null
        },
        update: {
          // If already assigned, maybe update status if it was pending and now we are re-assigning?
          // For now, keep existing or update to confirmed if safe
          status: hasClash ? "PENDING" : "CONFIRMED",
          note:   hasClash ? `時間衝突：與「${clashInfo?.activity.title}」重疊` : null
        }
      })
      results.push(ass)
    } catch (e) {
      console.error("Assignment error:", e)
    }
  }

  return NextResponse.json({ assignedCount: results.length, clashes, unmatched })
}
