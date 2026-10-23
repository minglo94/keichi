import { api, body, sameOrigin } from "@/lib/after-school/http";
import { actor } from "@/lib/after-school/auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    await actor();
    return prisma.afterSchoolRun.findMany({
      orderBy: { date: "desc" },
      take: 30,
      select: {
        date: true,
        status: true,
        lastError: true,
        preparedAt: true,
        automaticPreparedAt: true,
        announcementId: true,
        groups: { select: { type: true, activityId: true } },
        reminders: {
          select: {
            stage: true,
            status: true,
            attempts: { select: { status: true } },
          },
        },
      },
    });
  });
}
