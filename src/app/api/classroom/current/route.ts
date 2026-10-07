import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, isTeacherOrAdmin } from "@/lib/roles"
import { getCurrentLesson } from "@/lib/current-lesson"
import { resolveLessonClass, type ClassMatch } from "@/lib/class-link"
import { taughtClassKeys } from "@/lib/class-perm"
import { classKey } from "@/lib/roster-parse"
import { isFormClassName } from "@/lib/form-class"
import { dbErrorMessage } from "@/lib/db-error"

// The answer depends on the clock — never cache it.
export const dynamic = "force-dynamic"

// GET — everything the 課堂 landing needs in one call: which lesson is on now
// (or why that can't be known), the class it maps to, and the classes this
// teacher can open, each tagged with *why* they can open it.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const me = await prisma.user.findUnique({
      where:  { id: session.user.id },
      select: { name: true, nameEn: true, timetableName: true },
    })
    if (!me) return NextResponse.json({ error: "找不到帳戶" }, { status: 404 })

    const [lesson, taught, classes] = await Promise.all([
      getCurrentLesson(me),
      taughtClassKeys(session.user.id),
      prisma.class.findMany({
        select: {
          id: true, name: true, teacherId: true, homeroomTeacherId: true,
          _count: { select: { enrollments: true } },
        },
        orderBy: { name: "asc" },
      }),
    ])

    // The class the detected lesson refers to. Only for a lesson that is on now
    // or coming up next — a past lesson isn't something you open from here.
    const ref = lesson.kind === "now" ? lesson.lesson : lesson.kind === "next" ? lesson.next : null
    const classMatch: ClassMatch | null = ref ? await resolveLessonClass(session.user.id, ref.classCode) : null

    const admin = isAdmin(session.user.role)
    const mine = classes
      .map((c) => {
        const via =
          c.teacherId === session.user.id         ? "owner"
          : c.homeroomTeacherId === session.user.id ? "homeroom"
          : taught.has(classKey(c.name))           ? "timetable"
          : null
        return { id: c.id, name: c.name, count: c._count.enrollments, via, isForm: isFormClassName(c.name) }
      })
      .filter((c) => c.via !== null)

    // The rest of the school, for the picker's 全校班別 tier. Opening one is still
    // checked server-side; admins can open them all.
    const others = classes
      .filter((c) => !mine.some((m) => m.id === c.id))
      .map((c) => ({ id: c.id, name: c.name, count: c._count.enrollments, isForm: isFormClassName(c.name), openable: admin }))

    return NextResponse.json({ lesson, classMatch, mine, others })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[classroom/current]", err)
    return NextResponse.json({ error: msg ?? "未能載入課堂資料" }, { status: msg ? 503 : 500 })
  }
}
