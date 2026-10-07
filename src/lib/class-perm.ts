import { NextResponse } from "next/server"
import type { Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { isAdmin } from "@/lib/roles"
import { getAllTeachers, getLatestTerm, getTeacherLessons } from "@/lib/agent-timetable"
import { resolveAgainstTimetable } from "@/lib/teacher-match"
import { classKey } from "@/lib/roster-parse"
import { lessonClassKeys } from "@/lib/class-link"

// Who may open a class's 課堂: an admin, the class's owner, its 班主任, or a
// teacher who actually teaches it according to the timetable.
//
// The timetable branch is the one that matters most. The subject teacher in
// front of 3A is usually neither the person who happened to create the Class
// row nor the 班主任 — without it, 課堂 would 403 for most teachers on day one.
// Same shape as canManageActivity() in activity-perm.ts.

export type ClassAccess =
  | { ok: true; via: "admin" | "owner" | "homeroom" | "timetable" }
  | { ok: false }

type ClassRef = { id: string; name: string; teacherId: string; homeroomTeacherId: string | null }
type UserRef  = { id: string; role: Role | undefined }

/** Class keys this teacher teaches this term, per the timetable. */
export async function taughtClassKeys(userId: string): Promise<Set<string>> {
  const term = await getLatestTerm()
  if (!term) return new Set()
  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { name: true, nameEn: true, timetableName: true },
  })
  if (!user) return new Set()
  const match = resolveAgainstTimetable(user, await getAllTeachers(term))
  if (!match.ok) return new Set()
  const lessons = await getTeacherLessons(match.timetableName, term)
  return new Set(lessons.flatMap((l) => lessonClassKeys(l.classCode)))
}

export async function classAccess(cls: ClassRef, user: UserRef): Promise<ClassAccess> {
  if (isAdmin(user.role))                 return { ok: true, via: "admin" }
  if (cls.teacherId === user.id)          return { ok: true, via: "owner" }
  if (cls.homeroomTeacherId === user.id)  return { ok: true, via: "homeroom" }
  const key = classKey(cls.name)
  if (key && (await taughtClassKeys(user.id)).has(key)) return { ok: true, via: "timetable" }
  return { ok: false }
}

/**
 * Load the class and check access in one step. Returns the class, or a ready
 * 404/403 response to return straight from a route handler.
 */
export async function requireClassAccess(
  classId: string,
  user: UserRef,
): Promise<{ cls: ClassRef; via: Extract<ClassAccess, { ok: true }>["via"] } | NextResponse> {
  const cls = await prisma.class.findUnique({
    where:  { id: classId },
    select: { id: true, name: true, teacherId: true, homeroomTeacherId: true },
  })
  if (!cls) return NextResponse.json({ error: "找不到班別" }, { status: 404 })
  const access = await classAccess(cls, user)
  if (!access.ok) {
    return NextResponse.json(
      { error: "你未有任教此班，亦非班主任，未能開啟此班的課堂" },
      { status: 403 },
    )
  }
  return { cls, via: access.via }
}

/**
 * Load a 課堂 session and check access to its class. Records belong to the
 * class, so anyone who may open the class may record in its lessons — a
 * co-teacher or the 班主任 covering a period, not only whoever opened it.
 */
export async function requireSessionAccess(sessionId: string, user: UserRef) {
  const session = await prisma.classroomSession.findUnique({
    where:  { id: sessionId },
    select: { id: true, classId: true, teacherId: true, date: true, period: true, subject: true, endedAt: true },
  })
  if (!session) return NextResponse.json({ error: "找不到課堂" }, { status: 404 })
  const gate = await requireClassAccess(session.classId, user)
  if (gate instanceof NextResponse) return gate
  return { session, cls: gate.cls, via: gate.via }
}
