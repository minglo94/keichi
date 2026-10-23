import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Generated records belong to the source-backed preparation transaction.
export async function managedResourceResponse(
  kind: "activity" | "announcement" | "calendar",
  id: string,
) {
  const managed =
    kind === "announcement"
      ? await prisma.afterSchoolRun.findFirst({
          where: { announcementId: id },
          select: { date: true },
        })
      : await prisma.afterSchoolGroup.findFirst({
          where:
            kind === "activity"
              ? { activityId: id }
              : { activity: { calendarEventId: id } },
          select: { id: true },
        });
  return managed
    ? NextResponse.json(
        {
          error:
            "此項目由課後班自動化管理，請在行政公告的課後班面板修正來源並重新預覽。",
        },
        { status: 409 },
      )
    : null;
}
