import { overlaps, windowOf } from "@/lib/clash";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hkYmd, hkDayStart } from "@/lib/hk-date";
import {
  parseRows,
  formatAnnouncement,
  scheduleFor,
  instant,
  TYPES,
  type GroupType,
  type ResolvedParticipant,
} from "./model";
import { resolveParticipants } from "./policy";
import { readSource } from "./source";
import { withLease, approverAllowed } from "./repository";
import { AfterSchoolError } from "./http";
export type Reader = typeof readSource;
export async function previewDay(date: string, reader: Reader = readSource) {
  const config = await prisma.afterSchoolConfig.findUnique({
    where: { key: "school" },
  });
  if (!config) throw new AfterSchoolError(503, "請先設定課後班來源");
  const s = scheduleFor(date);
  const holiday = await prisma.nonTeachingPeriod.findFirst({
    where: {
      type: "HOLIDAY",
      startDate: { lte: hkDayStart(date) },
      endDate: { gte: hkDayStart(date) },
    },
    select: { id: true },
  });
  if (!s || holiday)
    return {
      date,
      skipped: true,
      reason: !s ? "週末" : "學校假期",
      rows: [] as ResolvedParticipant[],
      errors: [] as string[],
      hash: "",
      configVersion: config.version,
      title: "",
      body: "",
      schedule: s,
    };
  const values = await reader(config);
  const parsed = parseRows(values, date, config.schoolYearStart);
  const enrollments = await prisma.classEnrollment.findMany({
    select: {
      classId: true,
      classNumber: true,
      student: { select: { id: true, role: true } },
      class: { select: { name: true } },
    },
  });
  const resolved = resolveParticipants(
    parsed.rows,
    enrollments.map((e) => ({
      studentId: e.student.id,
      role: e.student.role,
      className: e.class.name,
      classId: e.classId,
      number: e.classNumber,
    })),
  );
  const errors = [...parsed.errors, ...resolved.errors];
  const assignments = await prisma.activityAssignment.findMany({
    where: {
      studentId: { in: resolved.rows.map((r) => r.studentId) },
      activity: {
        approval: { not: "REJECTED" },
        startTime: { lt: instant(date, s.end) },
        NOT: { afterSchoolGroup: { runDate: date } },
      },
    },
    select: {
      studentId: true,
      activity: { select: { title: true, startTime: true, endTime: true } },
    },
  });
  const window = { start: instant(date, s.start), end: instant(date, s.end) };
  for (const a of assignments)
    if (overlaps(window, windowOf(a.activity.startTime, a.activity.endTime))) {
      const row = resolved.rows.find((r) => r.studentId === a.studentId)!;
      errors.push(
        `${row.className} #${row.number} 與「${a.activity.title}」時間重疊，請先處理活動安排`,
      );
    }

  const normalized = resolved.rows;
  const hash = createHash("sha256")
    .update(JSON.stringify({ date, version: config.version, rows: normalized }))
    .digest("hex");
  return {
    date,
    skipped: false,
    reason: null,
    rows: normalized,
    errors,
    hash,
    configVersion: config.version,
    ...formatAnnouncement(date, normalized),
    schedule: s,
  };
}
export async function prepareDay(
  date: string,
  actorId: string,
  options: {
    expectedHash?: string;
    automatic?: boolean;
    now?: Date;
    reader?: Reader;
  } = {},
) {
  const now = options.now || new Date();
  if (!(await approverAllowed(actorId, !!options.automatic)))
    throw new AfterSchoolError(403, "批核者已沒有授權");
  if (date < hkYmd(now))
    throw new AfterSchoolError(400, "不可為過去日期刊登或發送");
  const schedule = scheduleFor(date);
  if (schedule && now >= instant(date, schedule.start))
    throw new AfterSchoolError(409, "課後班已開始，不能再自動改動名單");
  return withLease(date, async (token) => {
    let p: Awaited<ReturnType<typeof previewDay>>;
    try {
      p = await previewDay(date, options.reader);
      if (p.errors.length)
        throw new AfterSchoolError(422, p.errors.slice(0, 12).join("；"));
    } catch (e) {
      const message =
        e instanceof AfterSchoolError
          ? e.message
          : "來源讀取失敗，未刊登或發送";
      const existing = await prisma.afterSchoolRun.findUnique({
        where: { date },
        select: { status: true },
      });
      if (!existing)
        await prisma.afterSchoolRun.create({
          data: {
            date,
            status: "FAILED",
            participants: [],
            actorId,
            lastError: message,
          },
        });
      else
        await prisma.$transaction(async (tx) => {
          const run = await tx.afterSchoolRun.update({
            where: { date },
            data: { status: "FAILED", lastError: message },
            include: { groups: true },
          });
          if (run.announcementId)
            await tx.announcement.update({
              where: { id: run.announcementId },
              data: { status: "DRAFT" },
            });
          await tx.activity.updateMany({
            where: { id: { in: run.groups.map((g) => g.activityId) } },
            data: { approval: "PENDING" },
          });
        });
      throw e instanceof AfterSchoolError
        ? e
        : new AfterSchoolError(503, message);
    }
    const targetStatus = p.skipped
      ? "SKIPPED"
      : p.rows.length
        ? "READY"
        : "EMPTY";
    if (options.expectedHash && options.expectedHash !== p.hash)
      throw new AfterSchoolError(409, "試算表或名冊已改變，請重新預覽");
    const config = await prisma.afterSchoolConfig.findUniqueOrThrow({
      where: { key: "school" },
    });
    if (
      config.version !== p.configVersion ||
      (options.automatic && (!config.enabled || config.approverId !== actorId))
    )
      throw new AfterSchoolError(409, "設定已更新，請重試");
    const old = await prisma.afterSchoolRun.findUnique({ where: { date } });
    if (old?.sourceHash === p.hash && old.status === targetStatus) {
      await prisma.afterSchoolRun.update({
        where: { date },
        data: {
          lastError: null,
          ...(options.automatic ? { automaticPreparedAt: now } : {}),
        },
      });
      return { status: old.status, unchanged: true, count: p.rows.length };
    }
    await prisma.$transaction(
      async (tx) => {
        const lease = await tx.afterSchoolLease.findUnique({
          where: { key: `after-school:${date}` },
        });
        if (!lease || lease.token !== token || lease.expiresAt < new Date())
          throw new AfterSchoolError(409, "執行鎖已過期，請重試");
        const fresh = await tx.afterSchoolConfig.findUniqueOrThrow({
          where: { key: "school" },
        });
        if (fresh.version !== p.configVersion)
          throw new AfterSchoolError(409, "設定已更新，請重新預覽");
        const current = await tx.afterSchoolRun.upsert({
          where: { date },
          create: { date, participants: p.rows, actorId, status: "READY" },
          update: { participants: p.rows, actorId, lastError: null },
        });
        let announcementId = current.announcementId;
        if (p.rows.length) {
          const data = {
            title: p.title,
            body: p.body,
            committee: "ADMIN" as const,
            target: "ALL" as const,
            status: "PUBLISHED" as const,
            publishAt: instant(date, "07:00"),
          };
          if (announcementId) {
            await tx.announcement.update({
              where: { id: announcementId },
              data,
            });
          } else {
            announcementId = (
              await tx.announcement.create({
                data: { ...data, authorId: actorId },
              })
            ).id;
          }
        } else if (announcementId)
          await tx.announcement.update({
            where: { id: announcementId },
            data: { status: "ARCHIVED" },
          });
        for (const type of Object.keys(TYPES) as GroupType[]) {
          const rows = p.rows.filter((r) => r.type === type);
          const group = await tx.afterSchoolGroup.findUnique({
            where: { runDate_type: { runDate: date, type } },
            include: { activity: true },
          });
          if (!rows.length) {
            if (group) {
              await tx.activity.update({
                where: { id: group.activityId },
                data: {
                  approval: "REJECTED",
                  rejectionReason: "課後班名單已清空",
                },
              });
              await tx.activityAssignment.deleteMany({
                where: { activityId: group.activityId },
              });
              if (group.activity.calendarEventId)
                await tx.calendarEvent.deleteMany({
                  where: { id: group.activity.calendarEventId },
                });
              await tx.activity.update({
                where: { id: group.activityId },
                data: { calendarEventId: null },
              });
            }
            continue;
          }
          const info = TYPES[type];
          const title = `${p.title} · ${info.title}`;
          const fields = {
            title,
            description: p.body,
            startTime: instant(date, schedule!.start),
            endTime: instant(date, schedule!.end),
            location: info.location,
            committee: "ADMIN" as const,
            approval: "APPROVED" as const,
            approvedById: actorId,
            approvedAt: now,
            rejectionReason: null,
          };
          const activity = group
            ? await tx.activity.update({
                where: { id: group.activityId },
                data: fields,
              })
            : await tx.activity.create({
                data: { ...fields, createdById: actorId },
              });
          if (!group)
            await tx.afterSchoolGroup.create({
              data: { runDate: date, type, activityId: activity.id },
            });
          const calendarFields = {
            title,
            startDate: fields.startTime,
            endDate: fields.endTime,
            allDay: false,
            committee: "ADMIN" as const,
            description: `${schedule!.start}–${schedule!.end} · ${info.location}`,
          };
          if (activity.calendarEventId) {
            await tx.calendarEvent.update({
              where: { id: activity.calendarEventId },
              data: calendarFields,
            });
          } else {
            const event = await tx.calendarEvent.create({
              data: { ...calendarFields, authorId: actorId },
            });
            await tx.activity.update({
              where: { id: activity.id },
              data: { calendarEventId: event.id },
            });
          }
          const ids = rows.map((r) => r.studentId);
          await tx.activityAssignment.deleteMany({
            where: { activityId: activity.id, studentId: { notIn: ids } },
          });
          await tx.activityAssignment.createMany({
            data: ids.map((studentId) => ({
              activityId: activity.id,
              studentId,
              status: "CONFIRMED" as const,
            })),
            skipDuplicates: true,
          });
        }
        const ids = p.rows.map((r) => r.studentId);
        await tx.afterSchoolReminder.updateMany({
          where: { runDate: date, studentId: { notIn: ids } },
          data: { status: "CANCELLED" },
        });
        for (const row of p.rows) {
          for (const stage of ["MORNING", "AFTERNOON"]) {
            const payload = {
              title: `課後班提醒：${TYPES[row.type].title}`,
              body: `${row.className} #${row.number}　${date} ${schedule!.start}–${schedule!.end} · ${TYPES[row.type].location}`,
              link: "/student/activities",
              tag: `after-school:${date}:${stage}`,
            };
            const prior = await tx.afterSchoolReminder.findUnique({
              where: {
                runDate_stage_studentId: {
                  runDate: date,
                  stage,
                  studentId: row.studentId,
                },
              },
            });
            if (prior)
              await tx.afterSchoolReminder.update({
                where: { id: prior.id },
                data: {
                  groupType: row.type,
                  payload,
                  status: prior.notificationId ? "NOTIFIED" : "PENDING",
                },
              });
            else
              await tx.afterSchoolReminder.create({
                data: {
                  runDate: date,
                  stage,
                  studentId: row.studentId,
                  groupType: row.type,
                  payload,
                },
              });
          }
        }
        await tx.afterSchoolRun.update({
          where: { date },
          data: {
            status: targetStatus,
            sourceHash: p.hash,
            participants: p.rows,
            announcementId,
            preparedAt: now,
            lastError: null,
            ...(options.automatic ? { automaticPreparedAt: now } : {}),
          },
        });
      },
      { timeout: 60000 },
    );
    return {
      status: targetStatus,
      count: p.rows.length,
      unchanged: false,
    };
  });
}
