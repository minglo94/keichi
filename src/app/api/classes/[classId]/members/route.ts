import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireClassAccess } from "@/lib/class-perm"
import { z } from "zod"

type RouteParams = { params: { classId: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const enrollments = await prisma.classEnrollment.findMany({
    where: { classId: params.classId },
    include: {
      student: { select: { id: true, name: true, image: true, email: true } },
    },
    orderBy: { student: { name: "asc" } },
  })

  return NextResponse.json(enrollments)
}

// Either one student ({ userId }, as the 群組管理 page sends) or a batch
// ({ userIds }, from a pasted roster in 課堂).
const addSchema = z.union([
  z.object({ userId: z.string().min(1) }),
  z.object({ userIds: z.array(z.string().min(1)).min(1).max(200) }),
])

// Writes are limited to people who actually have this class: admin, owner,
// 班主任, or a teacher who teaches it per the timetable. Reads stay open to any
// teacher — notice-gen and the points page list rosters across classes, and
// the same names are already searchable via /api/students/search.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate

  const parsed = addSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "缺少學生" }, { status: 400 })

  if ("userIds" in parsed.data) {
    // Only real student accounts; duplicates are skipped rather than failing
    // the whole paste.
    const students = await prisma.user.findMany({
      where: { id: { in: parsed.data.userIds }, role: "STUDENT" }, select: { id: true },
    })
    const { count } = await prisma.classEnrollment.createMany({
      data: students.map((s) => ({ classId: params.classId, studentId: s.id })),
      skipDuplicates: true,
    })
    return NextResponse.json({
      added: count,
      skipped: parsed.data.userIds.length - count,
    }, { status: 201 })
  }

  const student = await prisma.user.findUnique({
    where: { id: parsed.data.userId }, select: { role: true },
  })
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "只可以加入學生帳戶" }, { status: 400 })
  }

  try {
    const enrollment = await prisma.classEnrollment.create({
      data: { classId: params.classId, studentId: parsed.data.userId },
      include: { student: { select: { id: true, name: true, image: true, email: true } } },
    })
    return NextResponse.json(enrollment, { status: 201 })
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "此學生已在名單內" }, { status: 409 })
    }
    throw err
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate

  const url = new URL(req.url)
  const userId = url.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  await prisma.classEnrollment.deleteMany({
    where: { classId: params.classId, studentId: userId },
  })

  return new NextResponse(null, { status: 204 })
}
