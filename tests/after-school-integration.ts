// Synthetic local DB only. See docs/AFTER_SCHOOL_AUTOMATION.md.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  prepareDay,
  previewDay,
  type Reader,
} from "../src/lib/after-school/service";
import { deliverDay } from "../src/lib/after-school/delivery";
import { tick } from "../src/lib/after-school/scheduler";
import { withLease } from "../src/lib/after-school/repository";
import { prisma } from "../src/lib/prisma";
if (
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL || "http://invalid").hostname,
  )
)
  throw new Error("Local disposable DB required");
const p = new PrismaClient();
const date = "2026-10-26";
const at = (t: string) => new Date(`${date}T${t}:00+08:00`);
const header = ["班別", "學號", "姓名", "日期", "類型", "出席", "備註"];
let values: unknown[][] = [
  header,
  ["1A", 8, "PRIVATE", date, "Tool UP / 功課班", false, "SECRET"],
  ["2F", 15, "PRIVATE", date, "正向班", false, "SECRET"],
];
const reader: Reader = async () => values;
async function main() {
  for (const [id, role] of [
    ["as-admin", "ADMIN"],
    ["as-s1", "STUDENT"],
    ["as-s2", "STUDENT"],
    ["as-s3", "STUDENT"],
  ] as const)
    await p.user.create({
      data: {
        id,
        email: `${id}@example.invalid`,
        name: "PRIVATE",
        role,
        departments: [],
        committees: [],
      },
    });
  for (const [id, name] of [
    ["as-1a", "1A"],
    ["as-2f", "2F"],
  ])
    await p.class.create({
      data: { id, name, classCode: id, teacherId: "as-admin" },
    });
  await p.classEnrollment.createMany({
    data: [
      { classId: "as-1a", studentId: "as-s1", classNumber: "08" },
      { classId: "as-2f", studentId: "as-s2", classNumber: "15" },
      { classId: "as-1a", studentId: "as-s3", classNumber: "23" },
    ],
  });
  await p.afterSchoolConfig.create({
    data: {
      spreadsheetId: "synthetic_source_id",
      sheetTitle: "工作表1",
      schoolYearStart: 2026,
      approverId: "as-admin",
      enabled: true,
    },
  });

  const clash = await p.activity.create({
    data: {
      title: "Synthetic clash",
      createdById: "as-admin",
      startTime: at("15:45"),
      endTime: at("16:45"),
      approval: "APPROVED",
      committee: "ADMIN",
      assignments: { create: { studentId: "as-s1" } },
    },
  });
  assert.match((await previewDay(date, reader)).errors.join(" "), /時間重疊/);
  await assert.rejects(
    () => prepareDay(date, "as-admin", { reader, now: at("06:00") }),
    /時間重疊/,
  );
  assert.equal(await p.announcement.count(), 0);
  await p.activity.delete({ where: { id: clash.id } });
  const preview = await previewDay(date, reader);
  assert.equal(preview.errors.length, 0);
  assert.match(preview.body, /1A #08/);
  assert.ok(!preview.body.includes("PRIVATE"));
  await prepareDay(date, "as-admin", {
    reader,
    now: at("06:00"),
    expectedHash: preview.hash,
    automatic: true,
  });
  assert.equal(await p.announcement.count(), 1);
  assert.equal(await p.activity.count(), 2);
  assert.equal(await p.afterSchoolReminder.count(), 4);
  assert.equal(await p.calendarEvent.count(), 2);
  assert.equal(
    (await p.announcement.findFirstOrThrow()).publishAt.toISOString(),
    "2026-10-25T23:00:00.000Z",
  );
  assert.equal(await p.activity.count({ where: { approval: "APPROVED" } }), 2);
  await prepareDay(date, "as-admin", { reader, now: at("06:01") });
  assert.equal(await p.announcement.count(), 1);
  assert.equal(await p.activity.count(), 2);
  values = [header, ["1A", 23, "PRIVATE", date, "功課班"]];
  await assert.rejects(
    prepareDay(date, "as-admin", {
      reader,
      now: at("06:02"),
      expectedHash: preview.hash,
    }),
    /改變/,
  );
  values = [header, ["1A", 99, "PRIVATE", date, "功課班"]];
  await assert.rejects(
    prepareDay(date, "as-admin", { reader, now: at("06:03") }),
    /未有學生帳戶/,
  );
  assert.equal(await p.announcement.count(), 1);
  assert.equal((await p.announcement.findFirstOrThrow()).status, "DRAFT");
  values = [
    header,
    ["1A", 8, "PRIVATE", date, "功課班"],
    ["2F", 15, "PRIVATE", date, "正向班"],
  ];
  await prepareDay(date, "as-admin", { reader, now: at("06:04") });
  await p.pushSubscription.createMany({
    data: [
      {
        id: "as-device-1",
        userId: "as-s1",
        endpoint: "https://push.invalid/s1",
        p256dh: "test",
        auth: "test",
      },
      {
        id: "as-device-2",
        userId: "as-s2",
        endpoint: "https://push.invalid/s2",
        p256dh: "test",
        auth: "test",
      },
    ],
  });
  const calls: string[] = [];
  const sender = async (
    sub: { endpoint: string },
    payload: string,
    options: { ttl: number },
  ) => {
    assert.ok(
      options.ttl > 0 && options.ttl <= 20700,
      "Provider TTL ends within the reminder window",
    );
    calls.push(sub.endpoint);
    assert.ok(!payload.includes("PRIVATE"));
    if (sub.endpoint.endsWith("/s2")) throw new Error("simulated timeout");
    return { statusCode: 201 };
  };
  await deliverDay(date, {
    clock: () => at("08:14"),
    sender,
    pushReady: () => true,
  });
  assert.equal(await p.notification.count(), 0);
  await deliverDay(date, {
    clock: () => at("08:15"),
    sender,
    pushReady: () => true,
  });
  assert.equal(calls.length, 2);
  assert.equal(await p.notification.count(), 2);
  assert.equal(
    await p.afterSchoolPushAttempt.count({ where: { status: "UNKNOWN" } }),
    1,
  );
  await deliverDay(date, {
    clock: () => at("08:16"),
    sender,
    pushReady: () => true,
  });
  assert.equal(calls.length, 2);
  assert.equal(await p.notification.count(), 2);
  await deliverDay(date, {
    clock: () => at("14:00"),
    sender,
    pushReady: () => true,
  });
  assert.equal(calls.length, 4);
  assert.equal(await p.notification.count(), 4);
  await deliverDay(date, {
    clock: () => at("14:01"),
    sender,
    pushReady: () => true,
  });
  assert.equal(calls.length, 4);
  values = [header, ["1A", 8, "", date, "功課班"]];
  await prepareDay(date, "as-admin", { reader, now: at("14:02") });
  assert.equal(
    await p.afterSchoolReminder.count({
      where: { studentId: "as-s2", status: "CANCELLED" },
    }),
    2,
  );
  assert.equal(
    await p.activityAssignment.count({ where: { studentId: "as-s2" } }),
    0,
  );
  values = [header];
  await prepareDay(date, "as-admin", { reader, now: at("14:03") });
  assert.equal(
    (await p.afterSchoolRun.findUniqueOrThrow({ where: { date } })).status,
    "EMPTY",
  );
  assert.equal((await p.announcement.findFirstOrThrow()).status, "ARCHIVED");
  assert.equal(await p.activity.count({ where: { approval: "APPROVED" } }), 0);
  await assert.rejects(
    prepareDay("2026-10-27", "as-admin", {
      now: new Date("2026-10-27T06:00:00+08:00"),
      reader: async () => {
        throw new Error("read failed");
      },
    }),
    /來源讀取失敗/,
  );
  assert.equal(
    (
      await p.afterSchoolRun.findUniqueOrThrow({
        where: { date: "2026-10-27" },
      })
    ).status,
    "FAILED",
  );
  await p.nonTeachingPeriod.create({
    data: {
      name: "Synthetic holiday",
      type: "HOLIDAY",
      startDate: new Date("2026-10-27T16:00Z"),
      endDate: new Date("2026-10-28T16:00Z"),
    },
  });
  const holiday = await prepareDay("2026-10-28", "as-admin", {
    reader,
    automatic: true,
    now: new Date("2026-10-28T06:00:00+08:00"),
  });
  assert.equal(holiday.status, "SKIPPED");
  assert.equal(
    (await p.afterSchoolRun.findUnique({ where: { date: "2026-10-28" } }))
      ?.status,
    "SKIPPED",
  );
  const tue = "2026-11-03";
  values = [header, ["1A", 8, "", tue, "功課班"]];
  let reads = 0;
  const counted: Reader = async () => {
    reads++;
    return values;
  };
  assert.equal(
    (await tick({ now: new Date(`${tue}T05:59:00+08:00`), reader: counted }))
      .status,
    "NOT_DUE",
  );
  await tick({ now: new Date(`${tue}T06:00:00+08:00`), reader: counted });
  await tick({ now: new Date(`${tue}T06:01:00+08:00`), reader: counted });
  assert.equal(reads, 1);
  const activity = await p.activity.findFirstOrThrow({
    where: { afterSchoolGroup: { runDate: tue } },
  });
  assert.equal(activity.startTime.toISOString(), `${tue}T08:00:00.000Z`);
  assert.equal(activity.endTime?.toISOString(), `${tue}T09:00:00.000Z`);
  await p.afterSchoolConfig.update({
    where: { key: "school" },
    data: { enabled: false },
  });
  assert.equal(
    (await tick({ now: new Date(`${tue}T07:00:00+08:00`), reader: counted }))
      .status,
    "DISABLED",
  );
  await p.afterSchoolConfig.update({
    where: { key: "school" },
    data: { enabled: true },
  });
  await p.user.update({ where: { id: "as-admin" }, data: { role: "TEACHER" } });
  assert.equal(
    (await tick({ now: new Date(`${tue}T07:00:00+08:00`), reader: counted }))
      .status,
    "APPROVER_REVOKED",
  );

  await p.user.update({ where: { id: "as-admin" }, data: { role: "ADMIN" } });
  const expiryDate = "2026-11-10";
  values = [header, ["1A", 8, "", expiryDate, "功課班"]];
  await prepareDay(expiryDate, "as-admin", {
    reader,
    now: new Date(expiryDate + "T06:00:00+08:00"),
  });
  await p.pushSubscription.create({
    data: {
      id: "as-device-extra",
      userId: "as-s1",
      endpoint: "https://push.invalid/extra",
      p256dh: "test",
      auth: "test",
    },
  });
  let fencedCalls = 0;
  const expirySender = async () => {
    fencedCalls++;
    if (fencedCalls === 1)
      await p.afterSchoolLease.update({
        where: { key: "after-school:" + expiryDate },
        data: { expiresAt: new Date(0) },
      });
  };
  await deliverDay(expiryDate, {
    clock: () => new Date(expiryDate + "T08:15:00+08:00"),
    sender: expirySender,
    pushReady: () => true,
  });
  assert.equal(fencedCalls, 1, "Expired worker must stop before next device");
  const reminder = await p.afterSchoolReminder.findFirstOrThrow({
    where: { runDate: expiryDate, stage: "MORNING" },
  });
  assert.ok(reminder.notificationId);
  const notificationId = reminder.notificationId;
  await deliverDay(expiryDate, {
    clock: () => new Date(expiryDate + "T08:16:00+08:00"),
    sender: expirySender,
    pushReady: () => true,
  });
  assert.equal(fencedCalls, 2, "New worker resumes remaining device only");
  assert.equal(
    (
      await p.afterSchoolReminder.findUniqueOrThrow({
        where: { id: reminder.id },
      })
    ).notificationId,
    notificationId,
  );
  await deliverDay(expiryDate, {
    clock: () => new Date(expiryDate + "T16:00:00+08:00"),
    sender: expirySender,
    pushReady: () => true,
  });
  assert.equal(fencedCalls, 2, "No late afternoon catch-up after class starts");
  let release!: () => void;
  const blocked = new Promise<void>((r) => (release = r));
  let acquired!: () => void;
  const ready = new Promise<void>((r) => (acquired = r));
  const first = withLease("synthetic-lease", async () => {
    acquired();
    await blocked;
  });
  await ready;
  await assert.rejects(
    withLease("synthetic-lease", async () => {}),
    /正在處理/,
  );
  release();
  await first;
  console.log(
    "DB INTEGRATION PASS: preparation, idempotence, hash change, failed source, assignments, cancellation, two-stage push, unknown no retry, holidays, Tuesday scheduler, revoked approver and lease",
  );
}
main()
  .finally(async () => {
    await p.$disconnect();
    await prisma.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
