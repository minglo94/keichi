import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

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
  if (activity.createdById !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studentIds = [], studentList } = schema.parse(await req.json())
  
  let targetStudentIds = [...studentIds]

  // Resolve student identifiers from list if provided
  if (studentList) {
    const lines = studentList.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length > 0) {
      const resolvedIds: string[] = []
      
      for (const line of lines) {
        // Try to match email directly
        if (line.includes("@")) {
          const u = await prisma.user.findUnique({ where: { email: line, role: "STUDENT" }, select: { id: true } })
          if (u) resolvedIds.push(u.id)
          continue
        }

        // Try to parse "Class No Name" (e.g. "4A 15 Chan Tai Man")
        const parts = line.split(/\s+/).filter(Boolean)
        if (parts.length >= 2) {
          const className = parts[0]
          const classNo   = parts[1]
          const maybeName = parts.slice(2).join(" ")

          // Find class first
          const cls = await prisma.class.findFirst({
            where: { name: { equals: className, mode: "insensitive" } },
            select: { id: true }
          })

          if (cls) {
            // Find enrollment by class and number
            const enrollment = await prisma.classEnrollment.findFirst({
              where: {
                classId: cls.id,
                classNumber: classNo
              },
              select: { studentId: true }
            })
            if (enrollment) {
              resolvedIds.push(enrollment.studentId)
              continue
            }
          }
        }

        // Fallback: match by full name
        const users = await prisma.user.findMany({
          where: { name: { equals: line, mode: "insensitive" }, role: "STUDENT" },
          select: { id: true }
        })
        if (users.length === 1) {
          resolvedIds.push(users[0].id)
        }
      }
      
      targetStudentIds = Array.from(new Set([...targetStudentIds, ...resolvedIds]))
    }
  }

  if (targetStudentIds.length === 0) {
    return NextResponse.json({ assigned: [], clashes: [] })
  }

  // Clash detection
  const activityEnd = activity.endTime ?? new Date(activity.startTime.getTime() + 60 * 60 * 1000)

  const clashingAssignments = await prisma.activityAssignment.findMany({
    where: {
      studentId: { in: targetStudentIds },
      activity: {
        id:        { not: params.id },
        startTime: { lt: activityEnd },
        endTime:   { gt: activity.startTime },
      },
    },
    include: {
      student:  { select: { id: true, name: true } },
      activity: { select: { id: true, title: true, startTime: true } },
    },
  })

  const clashes = clashingAssignments.map((a) => ({
    studentId:   a.studentId,
    studentName: a.student.name,
    activity:    { id: a.activity.id, title: a.activity.title, startTime: a.activity.startTime },
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

  return NextResponse.json({ assignedCount: results.length, clashes })
}
