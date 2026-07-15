import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"

// GET — classes with their student rosters. Teacher-readable; used by the
// behavior-record form (class dropdown + student multi-select) and dashboard.
//
// Sourced from the Class model (群組管理 → 班級分組). Only FORM_CLASS-style names
// are returned (same heuristic as the groups page: /^[1-6][A-Z]$/), so the
// dropdown matches what admins see under 班級分組. Students come from
// ClassEnrollment (User.name). Response shape is unchanged.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const classes = await prisma.class.findMany({
    include: {
      enrollments: {
        include: { student: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  })

  const isFormClass = (name: string) => /^[1-6][A-Z]$/.test(name.trim())

  const result = classes
    .filter((c) => isFormClass(c.name))
    .map((c) => ({
      className: c.name,
      students: c.enrollments
        .map((e) => ({ studentName: e.student.name ?? "", classNumber: e.classNumber }))
        .filter((s) => s.studentName)
        .sort((a, b) => a.studentName.localeCompare(b.studentName)),
    }))

  return NextResponse.json({ classes: result })
}
