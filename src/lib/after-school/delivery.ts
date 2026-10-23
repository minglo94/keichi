import { createHash } from "node:crypto";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { dueStages, scheduleFor, instant, type Stage } from "./model";
import { withLease } from "./repository";
import { deliveryOutcome } from "./policy";
export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { ttl: number },
) => Promise<unknown>;
export function pushConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY
  );
}
async function send(
  subscription: Parameters<PushSender>[0],
  payload: string,
  options: { ttl: number },
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@keichi.edu.hk",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return webpush.sendNotification(subscription, payload, {
    timeout: 10000,
    TTL: options.ttl,
  });
}
export async function deliverDay(
  date: string,
  options: {
    clock?: () => Date;
    sender?: PushSender;
    pushReady?: () => boolean;
  } = {},
) {
  const clock = options.clock || (() => new Date());
  const sender = options.sender || send;
  const pushReady = options.pushReady || pushConfigured;
  return withLease(date, async (token) => {
    const stages = dueStages(date, clock());
    const run = await prisma.afterSchoolRun.findUnique({
      where: { date },
      include: { groups: true },
    });
    if (!run || run.status !== "READY" || run.lastError)
      return { status: "NOT_READY" };
    await prisma.afterSchoolPushAttempt.updateMany({
      where: {
        status: "SENDING",
        updatedAt: { lt: new Date(+clock() - 600000) },
      },
      data: { status: "UNKNOWN" },
    });
    for (const stage of stages) {
      const pending = await prisma.afterSchoolReminder.findMany({
        where: { runDate: date, stage, status: { not: "CANCELLED" } },
        orderBy: { id: "asc" },
      });
      for (const reminder of pending) {
        const lease = await prisma.afterSchoolLease.findUnique({
          where: { key: `after-school:${date}` },
        });
        if (!lease || lease.token !== token || lease.expiresAt <= new Date())
          return { status: "LEASE_EXPIRED" };
        if (!dueStages(date, clock()).includes(stage))
          return { status: "EXPIRED" };
        const config = await prisma.afterSchoolConfig.findUnique({
          where: { key: "school" },
        });
        if (!config?.enabled) return { status: "DISABLED" };
        if (clock() >= instant(date, scheduleFor(date)!.start))
          return { status: "EXPIRED" };
        const current = await prisma.afterSchoolReminder.findUnique({
          where: { id: reminder.id },
        });
        if (!current || current.status === "CANCELLED") continue;
        // Create the durable student bell entry exactly once, independent of device availability.
        if (!current.notificationId)
          await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "AfterSchoolReminder" WHERE id = ${reminder.id} FOR UPDATE`;
            const fresh = await tx.afterSchoolReminder.findUniqueOrThrow({
              where: { id: reminder.id },
            });
            if (fresh.notificationId || fresh.status === "CANCELLED") return;
            const payload = fresh.payload as {
              title: string;
              body: string;
              link: string;
            };
            const n = await tx.notification.create({
              data: {
                userId: fresh.studentId,
                type: "GENERAL",
                title: payload.title,
                body: payload.body,
                link: payload.link,
              },
            });
            await tx.afterSchoolReminder.update({
              where: { id: fresh.id },
              data: { notificationId: n.id, status: "NOTIFIED" },
            });
          });
        if (!pushReady()) {
          await prisma.afterSchoolReminder.update({
            where: { id: reminder.id },
            data: { status: "NO_CONFIGURATION" },
          });
          continue;
        }
        const subscriptions = await prisma.pushSubscription.findMany({
          where: { userId: reminder.studentId },
        });
        if (!subscriptions.length) {
          await prisma.afterSchoolReminder.update({
            where: { id: reminder.id },
            data: { status: "NO_DEVICE" },
          });
          continue;
        }
        for (const sub of subscriptions) {
          const lease = await prisma.afterSchoolLease.findUnique({
            where: { key: `after-school:${date}` },
          });
          if (
            !lease ||
            lease.token !== token ||
            lease.expiresAt <= new Date() ||
            !dueStages(date, clock()).includes(stage)
          )
            return { status: "EXPIRED" };

          const endpointHash = createHash("sha256")
            .update(sub.endpoint)
            .digest("hex");
          await prisma.afterSchoolPushAttempt.createMany({
            data: [
              {
                reminderId: reminder.id,
                subscriptionId: sub.id,
                endpointHash,
                status: "PENDING",
              },
            ],
            skipDuplicates: true,
          });
          const attempt = await prisma.afterSchoolPushAttempt.findUniqueOrThrow(
            {
              where: {
                reminderId_endpointHash: {
                  reminderId: reminder.id,
                  endpointHash,
                },
              },
            },
          );
          const claimed = await prisma.afterSchoolPushAttempt.updateMany({
            where: {
              id: attempt.id,
              status: "PENDING",
              reminder: { status: { not: "CANCELLED" } },
            },
            data: { status: "SENDING" },
          });
          if (!claimed.count) continue;
          try {
            await sender(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify(reminder.payload),
              {
                ttl: Math.max(
                  1,
                  Math.floor(
                    (+instant(
                      date,
                      stage === "MORNING"
                        ? scheduleFor(date)!.remind
                        : scheduleFor(date)!.start,
                    ) -
                      +clock()) /
                      1000,
                  ),
                ),
              },
            );
            await prisma.afterSchoolPushAttempt.update({
              where: { id: attempt.id },
              data: { status: "ACCEPTED", statusCode: 201 },
            });
            const group = run.groups.find((g) => g.type === reminder.groupType);
            if (group)
              await prisma.activityAssignment.updateMany({
                where: {
                  activityId: group.activityId,
                  studentId: reminder.studentId,
                },
                data: { alertSent: true, alertedAt: clock() },
              });
          } catch (e) {
            const outcome = deliveryOutcome(e);
            await prisma.afterSchoolPushAttempt.update({
              where: { id: attempt.id },
              data: {
                status: outcome,
                statusCode: (e as { statusCode?: number })?.statusCode || null,
              },
            });
            if (outcome === "EXPIRED")
              await prisma.pushSubscription.deleteMany({
                where: { id: sub.id },
              });
          }
        }
        const attempts = await prisma.afterSchoolPushAttempt.findMany({
          where: { reminderId: reminder.id },
          select: { status: true },
        });
        const status = attempts.some(
          (a) => a.status === "UNKNOWN" || a.status === "SENDING",
        )
          ? "UNKNOWN"
          : attempts.some((a) => a.status === "FAILED")
            ? "FAILED"
            : attempts.some((a) => a.status === "ACCEPTED")
              ? "SENT"
              : "NO_DEVICE";
        await prisma.afterSchoolReminder.update({
          where: { id: reminder.id },
          data: { status },
        });
      }
    }
    return { status: "PROCESSED", stages: stages as Stage[] };
  });
}
