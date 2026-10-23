import { prisma } from "@/lib/prisma";
import { RESTRICTED_COMMITTEES } from "@/lib/committee";
import { dateWindow } from "./daily";
export type ClassDayActivity = {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  kind: "ACTIVITY" | "AFTER_SCHOOL";
  studentNumbers: string[];
  unnumberedCount: number;
};
export async function getClassDayActivities(
  classId: string,
  date: string,
): Promise<{ date: string; activities: ClassDayActivity[] }> {
  const { start, end } = dateWindow(date);
  const rows = await prisma.activity.findMany({
    where: {
      approval: "APPROVED",
      AND: [
        {
          OR: [
            { committee: null },
            { committee: { notIn: RESTRICTED_COMMITTEES } },
          ],
        },
        {
          OR: [
            { endTime: { gt: start } },
            { endTime: null, startTime: { gte: start } },
          ],
        },
      ],
      startTime: { lt: end },
      assignments: {
        some: { student: { enrollments: { some: { classId } } } },
      },
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      location: true,
      afterSchoolGroup: { select: { id: true } },
      assignments: {
        where: { student: { enrollments: { some: { classId } } } },
        select: {
          student: {
            select: {
              enrollments: {
                where: { classId },
                select: { classNumber: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });
  return {
    date,
    activities: rows.map((r) => ({
      id: r.id,
      title: r.title,
      startTime: r.startTime.toISOString(),
      endTime: r.endTime?.toISOString() || null,
      location: r.location,
      kind: r.afterSchoolGroup ? "AFTER_SCHOOL" : "ACTIVITY",
      studentNumbers: Array.from(
        new Set(
          r.assignments.flatMap((a) =>
            a.student.enrollments
              .map((e) => e.classNumber)
              .filter((n): n is string => !!n?.trim()),
          ),
        ),
      ).sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
      unnumberedCount: r.assignments.filter(
        (a) => !a.student.enrollments.some((e) => e.classNumber?.trim()),
      ).length,
    })),
  };
}
