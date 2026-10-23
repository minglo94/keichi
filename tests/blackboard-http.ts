// Run against an isolated synthetic database + app. Never point this at production.
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const url = process.env.BLACKBOARD_TEST_URL || "http://127.0.0.1:3100";
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL || "http://invalid").hostname,
  )
)
  throw new Error("Local synthetic database required");
function cookies(r: Response) {
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  origin = url,
) {
  return fetch(url + path, {
    method,
    headers: {
      origin,
      cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function staff(email: string) {
  const csrf = await request("/api/auth/csrf");
  const token = await csrf.json();
  const r = await fetch(url + "/api/auth/callback/credentials", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookies(csrf),
      origin: url,
    },
    body: new URLSearchParams({
      csrfToken: token.csrfToken,
      email,
      password: "synthetic123",
      callbackUrl: url + "/teacher/dashboard",
    }),
  });
  const c = cookies(r);
  assert.ok(c.includes("session-token"), `teacher sign in failed: ${r.status}`);
  return c;
}
async function status(r: Response, expected: number) {
  if (r.status !== expected)
    throw new Error(`Expected ${expected}, got ${r.status}: ${await r.text()}`);
}
async function main() {
  const password = await bcrypt.hash("synthetic123", 4);
  for (const [id, role, timetableName] of [
    ["bb-admin", "ADMIN", null],
    ["bb-owner", "TEACHER", null],
    ["bb-subject", "TEACHER", "Subject Teacher"],
    ["bb-other", "TEACHER", null],
    ["bb-student", "STUDENT", null],
  ] as const) {
    await p.user.create({
      data: {
        id,
        email: `${id}@example.invalid`,
        name: id,
        timetableName,
        role,
        password,
        departments: [],
        committees: [],
      },
    });
  }
  for (const [id, name] of [
    ["bb-a", "1A"],
    ["bb-b", "1B"],
  ])
    await p.class.create({
      data: {
        id,
        name,
        classCode: id,
        teacherId: "bb-owner",
        homeroomTeacherId: "bb-owner",
      },
    });
  await p.classEnrollment.create({
    data: { classId: "bb-a", studentId: "bb-student", classNumber: "08" },
  });
  await p.agentTimetable.create({
    data: {
      teacherName: "Subject Teacher",
      dayOfWeek: 1,
      period: 1,
      classCode: "1A",
      subject: "英文",
      term: "blackboard-test",
    },
  });
  await p.schoolSetting.upsert({
    where: { key: "timetable.activeTerm" },
    create: { key: "timetable.activeTerm", value: "blackboard-test" },
    update: { value: "blackboard-test" },
  });
  const hw = await p.homework.create({
    data: {
      classId: "bb-a",
      title: "練習一",
      subject: "中文",
      detail: "完成第一頁",
      assignedOn: new Date("2026-10-23T00:00:00+08:00"),
      recordedBy: "bb-owner",
      byRole: "TEACHER",
    },
  });
  await p.lessonRecord.create({
    data: {
      classId: "bb-a",
      studentId: "bb-student",
      kind: "MISSING_HOMEWORK",
      date: new Date("2026-10-23T00:00Z"),
      subject: "中文",
      homeworkId: hw.id,
      authorId: "bb-owner",
      note: "DO NOT EXPOSE",
    },
  });
  const admin = await staff("bb-admin@example.invalid"),
    owner = await staff("bb-owner@example.invalid"),
    subject = await staff("bb-subject@example.invalid"),
    other = await staff("bb-other@example.invalid");

  for (const [id, name] of [
    ["bb-four", "4A"],
    ["bb-three", "3A"],
  ])
    await p.class.create({
      data: { id, name, classCode: id, teacherId: "bb-owner" },
    });
  await p.agentTimetable.createMany({
    data: [
      {
        teacherName: "Group Physics",
        dayOfWeek: 1,
        period: 2,
        classCode: "S4-X1",
        subject: "物理",
        term: "blackboard-test",
      },
      {
        teacherName: "Group Biology",
        dayOfWeek: 1,
        period: 2,
        classCode: "S4-X1",
        subject: "生物",
        term: "blackboard-test",
      },
      {
        teacherName: "Group Chinese",
        dayOfWeek: 1,
        period: 2,
        classCode: "S3- G1",
        subject: "中文",
        term: "blackboard-test",
      },
    ],
  });
  const fourRes = await request(
    "/api/teacher/classes/bb-four/blackboard",
    "GET",
    undefined,
    owner,
  );
  await status(fourRes, 200);
  const four = (await fourRes.json()).snapshot.timetable;
  assert.deepEqual(
    four.rows.map((r: { subject: string }) => r.subject).sort(),
    ["物理", "生物"].sort(),
  );
  assert.equal(four.rows[0].groupLabel, "選修一");
  assert.match(four.warning, /分組/);
  const threeRes = await request(
    "/api/teacher/classes/bb-three/blackboard",
    "GET",
    undefined,
    owner,
  );
  await status(threeRes, 200);
  const three = (await threeRes.json()).snapshot.timetable;
  assert.equal(three.rows.length, 1);
  assert.equal(three.rows[0].subject, "中文");
  assert.equal(three.rows[0].groupCode, "S3-G1");
  const base = "/api/teacher/classes/bb-a/blackboard";
  await status(await request("/api/blackboard"), 401);
  await status(await request(base, "GET", undefined, other), 403);
  await status(
    await request(
      base + "/access",
      "PUT",
      { enabled: true, password: "classboard123", expectedVersion: 0 },
      owner,
      "https://evil.invalid",
    ),
    403,
  );
  await status(
    await request(
      base + "/access",
      "PUT",
      { enabled: true, password: "classboard123", expectedVersion: 0 },
      owner,
    ),
    200,
  );
  const login = await request("/api/blackboard/login", "POST", {
    className: "1a",
    password: "classboard123",
  });
  await status(login, 200);
  const board = cookies(login);
  await p.user.create({
    data: {
      id: "bb-day-other-student",
      email: "bb-day-other-student@example.invalid",
      role: "STUDENT",
      departments: [],
      committees: [],
    },
  });
  await p.classEnrollment.create({
    data: {
      classId: "bb-b",
      studentId: "bb-day-other-student",
      classNumber: "17",
    },
  });
  // Date-scoped class activities: approved participants only, no private notes/identities.
  const activityInput = {
    title: "Daily ECA",
    startTime: "2026-10-26T08:00:00.000Z",
    endTime: "2026-10-26T09:00:00.000Z",
    location: "303",
    committee: "ECA",
    studentIds: ["bb-student"],
  };
  const adminCreate = await request(
    "/api/activities",
    "POST",
    activityInput,
    admin,
  );
  await status(adminCreate, 201);
  const createdActivity = await adminCreate.json();
  assert.equal(createdActivity.approval, "APPROVED");
  assert.equal(createdActivity.approvedById, "bb-admin");
  assert.ok(createdActivity.approvedAt);
  assert.ok(createdActivity.calendarEventId);
  await p.activityAssignment.create({
    data: { activityId: createdActivity.id, studentId: "bb-day-other-student" },
  });
  await p.user.update({ where: { id: "bb-admin" }, data: { role: "STUDENT" } });
  await status(
    await request("/api/activities", "POST", activityInput, admin),
    403,
  );
  await p.user.update({ where: { id: "bb-admin" }, data: { role: "ADMIN" } });
  await p.committeeRole.create({
    data: { userId: "bb-owner", committee: "ECA", isChair: true },
  });
  const chairCreate = await request(
    "/api/activities",
    "POST",
    { ...activityInput, title: "Chair ECA" },
    owner,
  );
  await status(chairCreate, 201);
  assert.equal((await chairCreate.json()).approval, "APPROVED");
  const otherCommittee = await request(
    "/api/activities",
    "POST",
    { ...activityInput, committee: "IT" },
    owner,
  );
  await status(otherCommittee, 201);
  assert.equal((await otherCommittee.json()).approval, "PENDING");
  const teacherCreate = await request(
    "/api/activities",
    "POST",
    activityInput,
    other,
  );
  await status(teacherCreate, 201);
  assert.equal((await teacherCreate.json()).approval, "PENDING");
  const noCommittee = await request(
    "/api/activities",
    "POST",
    { title: "Admin no committee", startTime: activityInput.startTime },
    admin,
  );
  await status(noCommittee, 201);
  assert.equal((await noCommittee.json()).approval, "APPROVED");
  for (const [id, approval, committee, start, end, assigned] of [
    [
      "daily-night",
      "APPROVED",
      "ECA",
      "2026-10-25T15:30:00Z",
      "2026-10-25T16:30:00Z",
      true,
    ],
    ["daily-null", "APPROVED", "ECA", "2026-10-25T16:00:00Z", null, true],
    [
      "daily-private",
      "APPROVED",
      "STUDENT_SUPPORT",
      "2026-10-26T08:00:00Z",
      null,
      true,
    ],
    [
      "daily-other-class",
      "APPROVED",
      "ECA",
      "2026-10-26T08:00:00Z",
      null,
      false,
    ],
    [
      "daily-end-boundary",
      "APPROVED",
      "ECA",
      "2026-10-25T15:00:00Z",
      "2026-10-25T16:00:00Z",
      true,
    ],
  ] as const) {
    await p.activity.create({
      data: {
        id,
        title: id,
        approval,
        committee,
        startTime: new Date(start),
        endTime: end ? new Date(end) : null,
        createdById: "bb-admin",
        description: "DO NOT EXPOSE",
        ...(assigned
          ? {
              assignments: {
                create: { studentId: "bb-student", note: "DO NOT EXPOSE" },
              },
            }
          : {}),
      },
    });
  }
  await p.activityAssignment.create({
    data: {
      activityId: "daily-other-class",
      studentId: "bb-day-other-student",
    },
  });
  await p.afterSchoolRun.create({
    data: {
      date: "2026-10-26",
      status: "PREPARED",
      participants: [],
      actorId: "bb-admin",
    },
  });
  await p.afterSchoolGroup.create({
    data: {
      runDate: "2026-10-26",
      type: "TOOL_UP",
      activityId: createdActivity.id,
    },
  });
  await status(await request("/api/blackboard/day?date=2026-10-26"), 401);
  await status(
    await request(
      "/api/blackboard/day?date=2026-02-29",
      "GET",
      undefined,
      board,
    ),
    400,
  );
  await status(
    await request(
      "/api/blackboard/day?date=2026-10-26&date=2026-10-27",
      "GET",
      undefined,
      board,
    ),
    400,
  );
  const dayResponse = await request(
    "/api/blackboard/day?date=2026-10-26&classId=bb-b",
    "GET",
    undefined,
    board,
  );
  await status(dayResponse, 200);
  const dayData = await dayResponse.json();
  assert.equal(dayData.date, "2026-10-26");
  assert.equal(dayData.activities.length, 4);
  assert.deepEqual(
    dayData.activities.find((a: any) => a.id === createdActivity.id)
      .studentNumbers,
    ["08"],
  );
  assert.equal(
    dayData.activities.find((a: any) => a.id === createdActivity.id).kind,
    "AFTER_SCHOOL",
  );
  const publicDay = JSON.stringify(dayData);
  for (const forbidden of [
    "bb-student",
    "DO NOT EXPOSE",
    "daily-private",
    "daily-other-class",
    "daily-end-boundary",
  ])
    assert.ok(!publicDay.includes(forbidden), forbidden);
  const emptyDay = await request(
    "/api/blackboard/day?date=2026-10-27",
    "GET",
    undefined,
    board,
  );
  await status(emptyDay, 200);
  assert.equal((await emptyDay.json()).activities.length, 0);

  await status(
    await request(
      base + "/access",
      "PUT",
      { enabled: false, expectedVersion: 1 },
      board,
    ),
    403,
  );
  const snapshot = await request(
    "/api/blackboard?classId=bb-b",
    "GET",
    undefined,
    board,
  );
  await status(snapshot, 200);
  const j = await snapshot.json();
  assert.equal(j.classId, "bb-a");
  assert.equal(j.missing[0].number, "08");
  assert.equal(JSON.stringify(j).includes("DO NOT EXPOSE"), false);
  assert.equal(JSON.stringify(j).includes("bb-student"), false);
  const card = {
    type: "DETENTION",
    title: "留堂安排",
    body: "帶備功課",
    color: "amber",
    pinned: true,
    subject: null,
    startsAt: null,
    endsAt: null,
    payload: {
      studentNumbers: ["08"],
      date: "2026-10-26",
      startTime: "15:45",
      endTime: "16:30",
      location: "201",
    },
  };
  await status(
    await request(
      base + "/cards",
      "POST",
      { card, targetClassIds: ["bb-a"] },
      board,
    ),
    403,
  );
  const created = await request(
    base + "/cards",
    "POST",
    { card, targetClassIds: ["bb-a"] },
    owner,
  );
  await status(created, 200);
  const c = await created.json();
  await status(
    await request(
      base + `/cards/${c.id}`,
      "PUT",
      {
        card: { ...card, subject: "英文" },
        targetClassIds: ["bb-a"],
        expectedVersion: 1,
      },
      subject,
    ),
    403,
  );
  await status(
    await request(
      base + `/cards/${c.id}`,
      "PUT",
      { card, targetClassIds: ["bb-a"], expectedVersion: 9 },
      owner,
    ),
    409,
  );
  await status(
    await request(
      "/api/teacher/classes/bb-b/blackboard/cards/" + c.id,
      "PUT",
      { card, targetClassIds: ["bb-b"], expectedVersion: 1 },
      owner,
    ),
    404,
  );
  await status(
    await request(
      base + "/layout",
      "PUT",
      { items: [{ id: c.id, x: 0, y: 0, w: 4, h: 4 }], expectedVersion: 0 },
      subject,
    ),
    403,
  );
  await status(
    await request(
      base + "/layout",
      "PUT",
      {
        items: [{ id: "foreign", x: 0, y: 0, w: 4, h: 4 }],
        expectedVersion: 0,
      },
      owner,
    ),
    400,
  );
  await status(
    await request(
      base + "/layout",
      "PUT",
      { items: [{ id: c.id, x: 0, y: 0, w: 4, h: 4 }], expectedVersion: 0 },
      owner,
    ),
    200,
  );
  await status(
    await request(
      base + "/layout",
      "PUT",
      { items: [], expectedVersion: 0 },
      owner,
    ),
    409,
  );
  await status(
    await request(
      base + "/timetable",
      "PUT",
      {
        source: "MANUAL",
        rows: [{ id: "e", day: 1, period: 1, subject: "英文" }],
        expectedVersion: 0,
      },
      owner,
    ),
    200,
  );
  await status(
    await request(
      "/api/teacher/blackboard/schedule",
      "PUT",
      {
        slots: [
          {
            id: "p1",
            period: 1,
            label: "第一節",
            kind: "LESSON",
            startTime: "08:25",
            endTime: "09:00",
          },
        ],
        expectedVersion: 0,
      },
      owner,
    ),
    403,
  );
  await status(
    await request(
      "/api/teacher/blackboard/schedule",
      "PUT",
      {
        slots: [
          {
            id: "p1",
            period: 1,
            label: "第一節",
            kind: "LESSON",
            startTime: "08:25",
            endTime: "09:00",
          },
        ],
        expectedVersion: 0,
      },
      admin,
    ),
    200,
  );
  await p.agentTimetable.updateMany({
    where: { teacherName: "Subject Teacher" },
    data: { classCode: "1A/1B" },
  });
  await status(
    await request(
      "/api/teacher/classes/bb-b/blackboard",
      "GET",
      undefined,
      subject,
    ),
    200,
  );
  await p.agentTimetable.updateMany({
    where: { teacherName: "Subject Teacher" },
    data: { classCode: "1AB" },
  });
  await status(await request(base, "GET", undefined, subject), 403);
  await p.agentTimetable.updateMany({
    where: { teacherName: "Subject Teacher" },
    data: { classCode: "1A" },
  });
  const subjectCreated = await request(
    base + "/cards",
    "POST",
    {
      card: {
        type: "MEMO",
        title: "英文提醒",
        body: "溫習",
        subject: "英文",
        payload: {},
      },
      targetClassIds: ["bb-a"],
    },
    subject,
  );
  await status(subjectCreated, 200);
  await status(
    await request(
      base + "/cards",
      "POST",
      {
        card: { type: "MEMO", title: "中文提醒", subject: "中文", payload: {} },
        targetClassIds: ["bb-a"],
      },
      subject,
    ),
    403,
  );
  await status(
    await request(
      base + "/cards",
      "POST",
      {
        card: { type: "ANNOUNCEMENT", title: "全級提醒", payload: {} },
        targetClassIds: ["bb-a", "bb-b"],
      },
      admin,
    ),
    200,
  );
  await p.lessonRecord.updateMany({
    where: { classId: "bb-a" },
    data: { resolved: true },
  });
  const after = await (
    await request("/api/blackboard", "GET", undefined, board)
  ).json();
  assert.equal(after.missing.length, 0);
  assert.equal(after.cards.length, 3);
  assert.equal(after.timetable.source, "MANUAL");
  await status(
    await request(
      base + "/access",
      "PUT",
      { enabled: true, password: "newclass123", expectedVersion: 1 },
      owner,
    ),
    200,
  );
  await status(await request("/api/blackboard", "GET", undefined, board), 401);
  await status(
    await request("/api/blackboard/login", "POST", {
      className: "1A",
      password: "classboard123",
    }),
    401,
  );
  const newLogin = await request("/api/blackboard/login", "POST", {
    className: "1A",
    password: "newclass123",
  });
  await status(newLogin, 200);
  await status(
    await request(
      "/api/blackboard/logout",
      "POST",
      undefined,
      cookies(newLogin),
    ),
    200,
  );
  await status(
    await request("/api/blackboard", "GET", undefined, cookies(newLogin)),
    401,
  );
  await p.class.create({
    data: {
      id: "bb-duplicate",
      name: " 1a ",
      classCode: "bb-dup",
      teacherId: "bb-owner",
    },
  });
  await status(
    await request("/api/blackboard/login", "POST", {
      className: "1A",
      password: "newclass123",
    }),
    401,
  );
  await p.class.delete({ where: { id: "bb-duplicate" } });
  await p.blackboardSession.create({
    data: {
      tokenHash: "test",
      accessId: (
        await p.blackboardAccess.findUniqueOrThrow({
          where: { classId: "bb-a" },
        })
      ).id,
      sessionVersion: 1,
      expiresAt: new Date(0),
    },
  });
  await p.class.delete({ where: { id: "bb-a" } });
  assert.equal(await p.blackboardSession.count(), 0);

  for (const [id, name] of [
    ["bb-preset-one", "1A"],
    ["bb-preset-five", "5A"],
    ["bb-preset-group", "S4-X1"],
  ])
    await p.class.create({
      data: { id, name, classCode: id, teacherId: "bb-owner" },
    });
  await p.blackboardAccess.create({
    data: {
      classId: "bb-b",
      enabled: true,
      passwordHash: await bcrypt.hash("oldBoardPassword", 4),
      version: 7,
      sessionVersion: 4,
    },
  });
  const beforeReset = await request("/api/blackboard/login", "POST", {
    className: "1B",
    password: "oldBoardPassword",
  });
  await status(beforeReset, 200);
  const preset = "/api/admin/blackboard/preset-passwords";
  await status(await request(preset, "GET"), 403);
  await status(await request(preset, "GET", undefined, owner), 403);
  const previewResponse = await request(preset, "GET", undefined, admin);
  await status(previewResponse, 200);
  const presetPreview = await previewResponse.json();
  assert.ok(presetPreview.classes.includes("5A"));
  const presetInput = {
    expectedHash: presetPreview.expectedHash,
    confirmation: "PRESET_ALL_BLACKBOARDS",
  };
  await status(
    await request(preset, "POST", presetInput, admin, "https://evil.invalid"),
    403,
  );
  await status(await request(preset, "POST", presetInput, owner), 403);
  await status(
    await request(
      preset,
      "POST",
      { ...presetInput, expectedHash: "0".repeat(64) },
      admin,
    ),
    409,
  );
  await p.user.update({ where: { id: "bb-admin" }, data: { role: "TEACHER" } });
  await status(await request(preset, "POST", presetInput, admin), 403);
  await p.user.update({ where: { id: "bb-admin" }, data: { role: "ADMIN" } });
  const applyResponse = await request(preset, "POST", presetInput, admin);
  await status(applyResponse, 200);
  const applied = await applyResponse.json();
  assert.equal(applied.updated, 5);
  assert.equal(applied.skipped, 1);
  assert.equal(JSON.stringify(applied).includes("keichi"), false);
  const five = await p.blackboardAccess.findUniqueOrThrow({
    where: { classId: "bb-preset-five" },
  });
  assert.equal(five.enabled, true);
  assert.ok(await bcrypt.compare("keichi5a", five.passwordHash));
  assert.equal(
    await p.blackboardAccess.findUnique({
      where: { classId: "bb-preset-group" },
    }),
    null,
  );
  const afterReset = await request("/api/blackboard/login", "POST", {
    className: "5A",
    password: "keichi5a",
  });
  await status(afterReset, 200);
  await status(
    await request("/api/blackboard", "GET", undefined, cookies(beforeReset)),
    401,
  );
  await status(
    await request("/api/blackboard/login", "POST", {
      className: "1B",
      password: "oldBoardPassword",
    }),
    401,
  );
  await status(await request(preset, "POST", presetInput, admin), 409);
  console.log(
    "HTTP integration PASS: login, class isolation, privacy, author permissions, origin, versions, timetable, multi-class publication, reset, logout, duplicate class, cascade and administrator bulk presets",
  );
}
main()
  .finally(() => p.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
