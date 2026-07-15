import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateClassCode } from "@/lib/class-code"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().min(1).max(50),
  homeroomTeacherId: z.string().nullable().optional(),
})

// GET — list classes (admin: all; teacher: owned; student: enrolled)
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // STUDENT：只看自己已加入的班
  if (session.user.role === "STUDENT") {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { studentId: session.user.id },
      include: { class: { include: { teacher: { select: { name: true } } } } },
    })
    return NextResponse.json(enrollments.map((e) => e.class))
  }

  // TEACHER：自己擁有的班；ADMIN：全部班（群組管理用）
  const where = session.user.role === "ADMIN" ? {} : { teacherId: session.user.id }
  const classes = await prisma.class.findMany({
    where,
    include: {
      _count: { select: { enrollments: true } },
      homeroomTeacher: { select: { id: true, name: true, image: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(classes)
}

// POST — create class (teacher only)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { name, homeroomTeacherId } = createSchema.parse(body)

  // Retry until unique code is generated
  let classCode: string
  let attempts = 0
  do {
    classCode = generateClassCode()
    attempts++
    const existing = await prisma.class.findUnique({ where: { classCode } })
    if (!existing) break
  } while (attempts < 10)

  const newClass = await prisma.class.create({
    data: {
      name,
      classCode: classCode!,
      teacherId: session.user.id,
      homeroomTeacherId: homeroomTeacherId || undefined,
    },
    include: {
      homeroomTeacher: { select: { id: true, name: true, image: true, email: true } },
    },
  })

  return NextResponse.json(newClass, { status: 201 })
}
