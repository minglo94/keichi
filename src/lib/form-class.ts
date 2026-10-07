import { classKey } from "@/lib/roster-parse"

// A student can be enrolled in several Class rows: their form class (3A) plus
// any teaching groups (中四物理選修). Rankings and points are by form class, so
// anything that needs "which class is this student in" asks here.
//
// Names go through classKey(), so "S3A" and "F.3A" count as form classes too.

const FORM_KEY = /^[1-6][A-Z]$/

export function isFormClassName(name: string): boolean {
  return FORM_KEY.test(classKey(name))
}

type Enrol = { classNumber: string | null; class: { id?: string; name: string } }

/** The student's form-class enrollment, if any. */
export function formEnrollment<E extends Enrol>(enrollments: E[]): E | null {
  return enrollments.find((e) => isFormClassName(e.class.name)) ?? null
}
