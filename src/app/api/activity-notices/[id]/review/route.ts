import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, canEditCommittee } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { notify } from "@/lib/notify"
import { fanOutCommitteeEvent, createGoogleEvent, isConnected } from "@/lib/google-calendar"
import type { NoticePayload, NoticeSession, NoticeStudent } from "@/lib/notice"
import { findClashes, clashTitleMap } from "@/lib/clash"
import { z } from "zod"

const schema = z.object({
  action:          z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(1000).optional(),
})


const HHMM = /^\d{1,2}:\d{2}$/

/** Session date + 到達/離開時間 → a concrete window; whole day when untimed. */
function sessionWindow(s: NoticeSession): { start: Date; end: Date } {
  const from = HHMM.test(s.arriveTime ?? "") ? s.arriveTime! : "00:00"
  const to   = HHMM.test(s.leaveTime  ?? "") ? s.leaveTime!  : "23:59"
  const start = new Date(`${s.date}T${from.padStart(5, "0")}:00`)
  let   end   = new Date(`${s.date}T${to.padStart(5, "0")}:00`)
  if (isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

/**
 * Match the notice's roster rows to student accounts. Mirrors
 * /api/students/resolve: class + class number first (the school's own
 * numbering), then Chinese/English name, then email.
 */
async function resolveRosterStudentIds(rows: NoticeStudent[]): Promise<string[]> {
  const usable = rows.filter((r) => r?.name?.trim() || (r?.className?.trim() && r?.studentId?.trim()))
  if (usable.length === 0) return []

  const norm    = (v: string) => v.trim().toLowerCase()
  const normNum = (v: string) => v.trim().replace(/^0+/, "").toLowerCase()

  const classNames = Array.from(new Set(usable.map((r) => r.className?.trim()).filter(Boolean))) as string[]
  const names      = Array.from(new Set(usable.map((r) => r.name?.trim()).filter(Boolean))) as string[]

  const [enrollments, byName] = await Promise.all([
    classNames.length
      ? prisma.classEnrollment.findMany({
          where:  { class: { name: { in: classNames } } },
          select: {
            classNumber: true,
            class:   { select: { name: true } },
            student: { select: { id: true, role: true } },
          },
        })
      : Promise.resolve([]),
    names.length
      ? prisma.user.findMany({
          where:  { role: "STUDENT", OR: [{ name: { in: names } }, { nameEn: { in: names } }, { email: { in: names } }] },
          select: { id: true, name: true, nameEn: true, email: true },
        })
      : Promise.resolve([]),
  ])

  const byClassNo = new Map<string, string>()
  for (const e of enrollments) {
    if (e.student.role !== "STUDENT" || !e.classNumber) continue
    byClassNo.set(`${norm(e.class.name)}#${normNum(e.classNumber)}`, e.student.id)
  }
  const nameMap = new Map<string, string>()
  for (const u of byName) {
    if (u.name)   nameMap.set(norm(u.name), u.id)
    if (u.nameEn) nameMap.set(norm(u.nameEn), u.id)
    if (u.email)  nameMap.set(norm(u.email), u.id)
  }

  const ids = new Set<string>()
  for (const r of usable) {
    const cls = r.className?.trim() ?? ""
    const num = r.studentId?.trim() ?? ""
    const nm  = r.name?.trim() ?? ""
    const hit =
      (cls && num ? byClassNo.get(`${norm(cls)}#${normNum(num)}`) : undefined) ??
      (nm ? nameMap.get(norm(nm)) : undefined)
    if (hit) ids.add(hit)
  }
  return Array.from(ids)
}

// POST — chair of the notice's committee (or any admin) approves/rejects.
// Approving is what puts the activity on the school calendar.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const notice = await prisma.activityNotice.findUnique({ where: { id: params.id } })
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // canEditCommittee is exactly the rule wanted: that committee's chair, or admin.
  if (!(await canEditCommittee(session.user.id, session.user.role, notice.committee))) {
    return NextResponse.json({ error: "只有該組別主席或管理員可批核" }, { status: 403 })
  }
  if (notice.status !== "PENDING") {
    return NextResponse.json({ error: "此通告並非待批核狀態" }, { status: 409 })
  }

  const { action, rejectionReason } = schema.parse(await req.json())

  if (action === "reject") {
    if (!rejectionReason?.trim()) {
      return NextResponse.json({ error: "請填寫退回原因" }, { status: 400 })
    }
    const updated = await prisma.activityNotice.update({
      where: { id: params.id },
      data: {
        status: "REJECTED", rejectionReason: rejectionReason.trim(),
        reviewedById: session.user.id, reviewedAt: new Date(),
      },
    })
    await notify({
      userId: notice.createdById,
      type:   "DOC_APPROVAL",
      title:  `通告被退回：${notice.title}`,
      body:   rejectionReason.trim(),
      link:   `/teacher/committee/admin/activity-docs?id=${notice.id}`,
    })
    return NextResponse.json(updated)
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  const payload  = notice.payload as unknown as NoticePayload
  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : []

  let createdCount  = 0
  let activityCount = 0
  let assignedCount = 0

  // calendarSynced guards re-approval (only reachable if a notice were ever
  // reopened) from creating a second set of events/activities.
  if (!notice.calendarSynced) {
    // Resolve the notice's roster once — the same (班級+學號 → name → email)
    // matching the roster grid uses, so an approved notice produces a real
    // attendance list rather than discarding the students that were typed in.
    const roster = Array.isArray(payload?.students) ? payload.students : []
    const studentIds = await resolveRosterStudentIds(roster)

    for (const s of sessions as NoticeSession[]) {
      if (!s?.date) continue
      const start = new Date(`${s.date}T00:00:00`)
      if (isNaN(start.getTime())) continue

      const title = s.activityName?.trim() || notice.title

      // ── Calendar event (what the school-wide calendar shows) ──
      // CalendarEvent has no location column — fold time + venue into the notes.
      const parts = [s.time, s.location].filter(Boolean)
      const event = await prisma.calendarEvent.create({
        data: {
          title,
          startDate:   start,
          allDay:      true,
          committee:   notice.committee,
          description: parts.length ? parts.join(" · ") : null,
          authorId:    notice.createdById,
        },
      })
      createdCount++

      // Mirror what POST /api/calendar-events does, so approved events reach
      // Google Calendar the same way a hand-made one would.
      try {
        if (await isConnected(notice.createdById)) await createGoogleEvent(notice.createdById, event)
        await fanOutCommitteeEvent(event)
      } catch (err) {
        console.error("[notice] calendar sync failed:", err)
      }

      // ── Activity + assignments (attendance, 提醒, clash detection) ──
      // One Activity per session, which is how attendance is actually taken.
      const { start: aStart, end: aEnd } = sessionWindow(s)
      const activity = await prisma.activity.create({
        data: {
          title,
          description:  notice.title !== title ? notice.title : null,
          startTime:    aStart,
          endTime:      aEnd,
          location:     s.location || null,
          committee:    notice.committee,
          activityType: notice.committee === "ECA" ? "ECA" : "ACADEMIC",
          createdById:  notice.createdById,
          // Already signed off — this IS the chair approving it. Asking for a
          // second approval on the same activity would be redundant.
          approval:     "APPROVED",
          approvedById: session.user.id,
          approvedAt:   new Date(),
          // Link the event created just above, so deleting this activity later
          // also removes its calendar entry.
          calendarEventId: event.id,
        },
      })
      activityCount++

      if (studentIds.length > 0) {
        // Flag anyone already booked elsewhere at this time, same treatment as
        // POST /api/activities.
        const hits     = await findClashes(studentIds, [{ start: aStart, end: aEnd }], activity.id)
        const clashMap = clashTitleMap(hits)
        const res = await prisma.activityAssignment.createMany({
          data: studentIds.map((studentId) => {
            const clash = clashMap.get(studentId)
            return {
              activityId: activity.id,
              studentId,
              status: (clash ? "PENDING" : "CONFIRMED") as never,
              note:   clash ? `時間衝突：與「${clash}」重疊` : null,
            }
          }),
          skipDuplicates: true,
        })
        assignedCount += res.count
      }
    }
  }

  const updated = await prisma.activityNotice.update({
    where: { id: params.id },
    data: {
      status: "APPROVED", rejectionReason: null,
      reviewedById: session.user.id, reviewedAt: new Date(),
      calendarSynced: true,
    },
  })

  await notify({
    userId: notice.createdById,
    type:   "DOC_APPROVAL",
    title:  `通告已批核：${notice.title}`,
    body:   createdCount > 0
      ? `已加入 ${createdCount} 個活動到行事曆${assignedCount > 0 ? `，並指派 ${assignedCount} 人次出席` : ""}`
      : "已批核",
    link:   `/teacher/committee/admin/activity-docs?id=${notice.id}`,
  })

  return NextResponse.json({
    ...updated,
    calendarEventsCreated: createdCount,
    activitiesCreated:     activityCount,
    assignmentsCreated:    assignedCount,
  })
}
