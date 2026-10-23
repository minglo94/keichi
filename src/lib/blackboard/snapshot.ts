import { prisma } from "@/lib/prisma";
import type { BlackboardCard } from "@prisma/client";
import type { BoardSnapshot, PublicCard } from "./types";
import { cardInputSchema, layoutInputSchema } from "./validation";
import { getBoardTimetable } from "./timetable";
import { isPublished, projectMissing } from "./projection";
export function publicCard(c: BlackboardCard): PublicCard {
  return {
    ...cardInputSchema.parse({
      type: c.type,
      title: c.title,
      body: c.body,
      subject: c.subject,
      color: c.color,
      pinned: c.pinned,
      link: c.link,
      payload: c.payload,
      startsAt: c.startsAt?.toISOString() || null,
      endsAt: c.endsAt?.toISOString() || null,
    }),
    id: c.id,
    version: c.version,
  };
}
export async function getBoardSnapshot(
  classId: string,
  now = new Date(),
): Promise<BoardSnapshot> {
  const [cls, homework, records, roster, cards, layout, timetable] =
    await Promise.all([
      prisma.class.findUniqueOrThrow({
        where: { id: classId },
        select: { id: true, name: true },
      }),
      prisma.homework.findMany({
        where: { classId },
        select: {
          id: true,
          subject: true,
          title: true,
          detail: true,
          dueDate: true,
        },
        orderBy: { assignedOn: "desc" },
        take: 100,
      }),
      prisma.lessonRecord.findMany({
        where: {
          classId,
          resolved: false,
          kind: { in: ["MISSING_HOMEWORK", "HOMEWORK_ABSENT"] },
        },
        select: {
          resolved: true,
          kind: true,
          studentId: true,
          date: true,
          subject: true,
          homework: { select: { title: true } },
        },
        orderBy: { date: "desc" },
        take: 1000,
      }),
      prisma.classEnrollment.findMany({
        where: { classId },
        select: { studentId: true, classNumber: true },
      }),
      prisma.blackboardCard.findMany({
        where: {
          targets: { some: { classId } },
          archivedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      }),
      prisma.blackboardLayout.findUnique({ where: { classId } }),
      getBoardTimetable(classId),
    ]);
  return {
    classId: cls.id,
    className: cls.name,
    generatedAt: now.toISOString(),
    homework: homework.map((h) => ({
      ...h,
      dueDate: h.dueDate?.toISOString() || null,
    })),
    missing: projectMissing(records, roster),
    cards: cards.filter((c) => isPublished(c, now)).map(publicCard),
    layout: layout
      ? {
          items: layoutInputSchema.parse({
            items: layout.items,
            expectedVersion: layout.version,
          }).items,
          version: layout.version,
        }
      : { items: [], version: 0 },
    timetable,
  };
}
