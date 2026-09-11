import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"

// GET — students with their form class, for any teacher.
//
// The activity 出席名單 picker used to read /api/admin/users, which is
// admin-gated: a plain teacher got a 403 and the dropdown just stayed empty,
// with no indication why.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const params  = new URL(req.url).searchParams
  const q       = params.get("q")?.trim()
  const classId = params.get("classId")?.trim()
  const take    = Math.min(Math.max(parseInt(params.get("take") ?? "200", 10) || 200, 1), 1000)

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...(classId ? { enrollments: { some: { classId } } } : {}),
      ...(q ? {
        OR: [
          { name:   { contains: q, mode: "insensitive" as const } },
          { nameEn: { contains: q, mode: "insensitive" as const } },
          { email:  { contains: q, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    select: {
      id: true, name: true, nameEn: true, email: true, role: true,
      enrollments: {
        select: { classNumber: true, class: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: "asc" },
    take,
  })

  return NextResponse.json(students)
}
