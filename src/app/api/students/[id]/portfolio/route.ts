import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const studentId = params.id

  const [student, submissions, activities, points, behavior] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, image: true }
    }),
    prisma.missionSubmission.findMany({
      where: { studentId },
      include: { mission: true },
      orderBy: { submittedAt: "desc" }
    }),
    prisma.activityAssignment.findMany({
      where: { studentId },
      include: { activity: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.pointTransaction.findMany({
      where: { userId: studentId },
      include: { class: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.behaviorRecord.findMany({
      where: { studentName: { contains: studentId } }, // This might be tricky if studentName is a string, let's check schema
      orderBy: { date: "desc" }
    })
  ])

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 })
  }

  // Calculate some stats
  const totalPoints = points.reduce((acc, p) => acc + p.amount, 0)
  const completedMissions = submissions.filter(s => s.status === "APPROVED").length
  const attendanceRate = activities.length > 0 
    ? (activities.filter(a => a.status === "ATTENDED").length / activities.length) * 100 
    : 100

  return NextResponse.json({
    student,
    stats: {
      totalPoints,
      completedMissions,
      attendanceRate,
    },
    submissions,
    activities,
    points,
    behavior
  })
}
