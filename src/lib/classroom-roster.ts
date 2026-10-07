import { prisma } from "@/lib/prisma"
import { formEnrollment, isFormClassName } from "@/lib/form-class"

// The roster as 課堂 shows it. For a form class, a student is identified by
// their number in it (「12. 陳大文」). For a teaching group (中四物理選修),
// numbers in the group usually don't exist, so the student's own form class and
// number are used instead (「4B12 陳大文」) — that's how teachers refer to them.

export type RosterStudent = {
  id:          string
  name:        string | null
  nameEn:      string | null
  classNumber: string | null   // number within THIS class, if any
  formClass:   string | null   // the student's form class, e.g. "4B"
  formNo:      string | null
  /** Short identifier shown on a seat: "12" in a form class, "4B12" in a group. */
  tag:         string
}

const numKey = (n: string | null) => {
  const v = parseInt(n ?? "", 10)
  return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER
}

export async function loadRoster(classId: string, className: string): Promise<RosterStudent[]> {
  const isForm = isFormClassName(className)
  const rows = await prisma.classEnrollment.findMany({
    where:  { classId, student: { role: "STUDENT" } },
    select: {
      classNumber: true,
      student: {
        select: {
          id: true, name: true, nameEn: true,
          enrollments: { select: { classNumber: true, class: { select: { name: true } } } },
        },
      },
    },
  })

  return rows
    .map((r) => {
      const form = formEnrollment(r.student.enrollments)
      const formClass = form?.class.name ?? null
      const formNo    = form?.classNumber ?? null
      // In a form class, the number in this class; anyone without one (a
      // student added from another class) falls back to their own class+number.
      const tag = isForm && r.classNumber
        ? r.classNumber
        : `${formClass ?? ""}${formNo ?? ""}`
      return {
        id: r.student.id, name: r.student.name, nameEn: r.student.nameEn,
        classNumber: r.classNumber, formClass, formNo, tag,
      }
    })
    .sort((a, b) => isForm
      ? numKey(a.classNumber) - numKey(b.classNumber) || (a.name ?? "").localeCompare(b.name ?? "")
      : (a.formClass ?? "").localeCompare(b.formClass ?? "") || numKey(a.formNo) - numKey(b.formNo))
}

/** Ordering number used by 自動排座: class number in a form class, form number in a group. */
export function seatSortNumber(r: RosterStudent, isForm: boolean): string | null {
  return isForm ? r.classNumber : r.formNo
}
