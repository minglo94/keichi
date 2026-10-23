import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClassAccess } from "@/lib/class-perm";
import {
  getLatestTerm,
  getTeacherLessons,
  getAllTeachers,
} from "@/lib/agent-timetable";
import { resolveAgainstTimetable } from "@/lib/teacher-match";
import { subjectsForClass } from "./projection";

import { BoardError } from "./request";
import { canManageBoard } from "./policy";
export async function requireBoardTeacher(
  classId: string,
  mode: "publish" | "manage",
) {
  const session = await auth();
  if (!session?.user || !["TEACHER", "ADMIN"].includes(session.user.role))
    throw new BoardError(403, "只有教師可以操作");
  // Reuse the existing manager gate, but require conservative explicit mapping
  // for timetable-only access (the legacy gate accepts ambiguous prefixes).
  const gate = await requireClassAccess(classId, session.user);
  const cls =
    gate instanceof Response
      ? await prisma.class.findUnique({
          where: { id: classId },
          select: {
            id: true,
            name: true,
            teacherId: true,
            homeroomTeacherId: true,
          },
        })
      : gate.cls;
  if (!cls) throw new BoardError(404, "找不到班別");
  const isManager = !(gate instanceof Response) && canManageBoard(gate.via);
  if (!isManager && !(await teacherSubjects(session.user.id, cls.name)).length)
    throw new BoardError(403, "沒有此班的存取權限");
  if (mode === "manage" && !isManager)
    throw new BoardError(403, "只有班主任或管理員可管理此黑板");
  return {
    userId: session.user.id,
    isManager,
    isAdmin: session.user.role === "ADMIN",
    cls,
  };
}
export async function teacherSubjects(
  userId: string,
  className: string,
): Promise<string[]> {
  const term = await getLatestTerm();
  if (!term) return [];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, nameEn: true, timetableName: true },
  });
  if (!user) return [];
  const match = resolveAgainstTimetable(user, await getAllTeachers(term));
  if (!match.ok) return [];
  const lessons = await getTeacherLessons(match.timetableName, term);
  return subjectsForClass(lessons, className);
}
