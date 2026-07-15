import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().optional(),
  startTime:   z.string().datetime(),
  endTime:     z.string().datetime().optional(),
  location:    z.string().max(200).optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]).optional(),
  activityType: z.enum(["ECA", "ACADEMIC"]).optional(),
  studentList: z.string().optional(), // Raw text from Excel paste
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // STUDENT：只看分配給自己的活動
  if (session.user.role === "STUDENT") {
    const studentActivities = await prisma.activity.findMany({
      where: {
        assignments: { some: { studentId: session.user.id } }
      },
      include: {
        assignments: {
          where: { studentId: session.user.id },
          select: { status: true, note: true }
        },
        createdBy: { select: { id: true, name: true } }
      },
      orderBy: { startTime: "asc" },
    })
    return NextResponse.json(studentActivities)
  }

  // TEACHER：自己建立的活動；ADMIN：全部活動
  const where = session.user.role === "ADMIN" ? {} : { createdById: session.user.id }
  const activities = await prisma.activity.findMany({
    where,
    include: {
      _count: { select: { assignments: true } },
      assignments: { where: { status: "CONFIRMED" }, select: { id: true } },
    },
    orderBy: { startTime: "asc" },
  })
  return NextResponse.json(activities)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  let data: ReturnType<typeof createSchema.parse>
  try { data = createSchema.parse(body) } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Validation error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { studentList } = data
  
  const activity = await prisma.activity.create({
    data: {
      title:       data.title,
      description: data.description,
      startTime:   new Date(data.startTime),
      endTime:     data.endTime ? new Date(data.endTime) : undefined,
      location:     data.location,
      committee:    data.committee,
      activityType: data.activityType,
      createdById:  session.user.id,
    },
    include: {
      _count:      { select: { assignments: true } },
      assignments: { where: { status: "CONFIRMED" }, select: { id: true } },
    },
  })

  // Process student list if provided
  if (studentList) {
    const lines = studentList.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length > 0) {
      const resolvedUsers = await prisma.user.findMany({
        where: {
          OR: [
            { email: { in: lines } },
            { name:  { in: lines } }
          ],
          role: "STUDENT"
        },
        select: { id: true, name: true }
      })

      if (resolvedUsers.length > 0) {
        const targetStudentIds = resolvedUsers.map(u => u.id)
        const activityEnd = activity.endTime ?? new Date(activity.startTime.getTime() + 60 * 60 * 1000)

        // Clash detection
        const clashingAssignments = await prisma.activityAssignment.findMany({
          where: {
            studentId: { in: targetStudentIds },
            activity: {
              id:        { not: activity.id },
              startTime: { lt: activityEnd },
              endTime:   { gt: activity.startTime },
            },
          },
          include: {
            activity: { select: { title: true } }
          }
        })

        const clashMap = new Map(clashingAssignments.map(a => [a.studentId, a.activity.title]))

        // Assign all
        await prisma.activityAssignment.createMany({
          data: resolvedUsers.map(user => {
            const clashTitle = clashMap.get(user.id)
            return {
              activityId: activity.id,
              studentId:  user.id,
              status:     clashTitle ? "PENDING" : "CONFIRMED" as any,
              note:       clashTitle ? `時間衝突：與「${clashTitle}」重疊` : null
            }
          }),
          skipDuplicates: true
        })
      }
    }
  }

  return NextResponse.json(activity, { status: 201 })
}
