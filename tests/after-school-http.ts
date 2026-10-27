import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const base = "http://127.0.0.1:3101";
if (
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Disposable local DB only");
const p = new PrismaClient();
async function login(email: string) {
  const r = await fetch(base + "/api/auth/csrf");
  const { csrfToken } = await r.json();
  const cookie = r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  const logged = await fetch(base + "/api/auth/callback/credentials", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie,
      origin: base,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: "synthetic-password",
      callbackUrl: base,
    }),
  });
  const result = logged.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  assert.match(result, /session-token/);
  return result;
}
async function main() {
  const password = await bcrypt.hash("synthetic-password", 4);
  await p.user.update({
    where: { id: "as-admin" },
    data: { role: "ADMIN", password },
  });
  for (const [id, role] of [
    ["as-chair", "TEACHER"],
    ["as-teacher", "TEACHER"],
    ["as-student", "STUDENT"],
  ] as const)
    await p.user.create({
      data: {
        id,
        email: id + "@example.invalid",
        role,
        name: "Synthetic",
        password,
        departments: [],
        committees: [],
      },
    });
  await p.committeeRole.create({
    data: { userId: "as-chair", committee: "ADMIN", isChair: true },
  });
  await p.afterSchoolConfig.update({
    where: { key: "school" },
    data: { enabled: false, approverId: "as-admin" },
  });
  const admin = await login("as-admin@example.invalid"),
    chair = await login("as-chair@example.invalid"),
    teacher = await login("as-teacher@example.invalid"),
    student = await login("as-student@example.invalid");
  const request = (
    path: string,
    cookie = admin,
    method = "GET",
    data?: unknown,
    origin = base,
  ) =>
    fetch(base + path, {
      method,
      headers: { cookie, origin, "Content-Type": "application/json" },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  for (const cookie of ["", teacher, student])
    assert.equal(
      (await request("/api/after-school/config", cookie)).status,
      403,
    );
  assert.equal((await request("/api/after-school/config", chair)).status, 200);
  assert.equal(
    (await request("/api/after-school/config", chair, "PUT", {})).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/after-school/preview",
        admin,
        "POST",
        { date: "2026-11-09" },
        "https://wrong.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/cron/after-school", admin, "POST", {})).status,
    401,
  );
  const cron = await fetch(base + "/api/cron/after-school", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.AFTERSCHOOL_CRON_SECRET },
  });
  assert.equal((await cron.json()).status, "DISABLED");
  const preview = await request("/api/after-school/preview", chair, "POST", {
    date: "2026-11-09",
  });
  assert.equal(preview.status, 200);
  let data = await preview.json();
  assert.equal(data.errors.length, 0);
  assert.match(data.body, /1A #08/);
  assert.ok(!JSON.stringify(data).includes("PRIVATE"));
  assert.ok(!JSON.stringify(data.rows).includes("studentId"));
  assert.equal(
    (
      await request("/api/after-school/run", chair, "POST", {
        date: "2026-11-09",
        expectedHash: "0".repeat(64),
      })
    ).status,
    409,
  );
  const overlapActivity = await p.activity.create({
    data: {
      title: "HTTP overlap",
      createdById: "as-admin",
      committee: "ADMIN",
      approval: "APPROVED",
      startTime: new Date("2026-11-09T15:45:00+08:00"),
      endTime: new Date("2026-11-09T16:45:00+08:00"),
      assignments: { create: { studentId: "as-s1" } },
    },
  });
  const warningPreview = await request(
    "/api/after-school/preview",
    chair,
    "POST",
    { date: "2026-11-09" },
  );
  assert.equal(warningPreview.status, 200);
  data = await warningPreview.json();
  assert.equal(data.errors.length, 0);
  assert.match(data.warnings.join(" "), /時間重疊/);
  assert.equal(
    (
      await request("/api/after-school/run", chair, "POST", {
        date: "2026-11-09",
        expectedHash: data.hash,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/after-school/run", chair, "POST", {
        date: "2026-11-09",
        expectedHash: data.hash,
        acceptConflicts: "true",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/after-school/run", teacher, "POST", {
        date: "2026-11-09",
        expectedHash: data.hash,
        acceptConflicts: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/after-school/run", chair, "POST", {
        date: "2026-11-09",
        expectedHash: data.hash,
        acceptConflicts: true,
      })
    ).status,
    200,
  );
  const statusResponse = await request("/api/after-school/status", chair);
  assert.equal(statusResponse.status, 200);
  const noted = (await statusResponse.json()).find(
    (run: any) => run.date === "2026-11-09",
  );
  assert.equal(noted.status, "READY");
  assert.match(noted.lastError, /HTTP overlap/);
  assert.equal(
    (
      await request("/api/after-school/run", chair, "POST", {
        date: "2026-11-09",
        expectedHash: data.hash,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/after-school/run", chair, "POST", {
        date: "2026-11-09",
        expectedHash: data.hash,
      })
    ).status,
    200,
  );
  const run = await p.afterSchoolRun.findUniqueOrThrow({
    where: { date: "2026-11-09" },
    include: { groups: { include: { activity: true } } },
  });
  assert.equal(run.groups.length, 2);
  const activity = run.groups[0].activity;
  // Student copies are projected server-side, including already-published text.
  const namedAnnouncement = await p.announcement.findUniqueOrThrow({where:{id:run.announcementId!}});
  assert.match(namedAnnouncement.body,/陳小明/);
  await p.announcement.update({where:{id:run.announcementId!},data:{publishAt:new Date('2026-01-01T00:00:00Z')}});
  const studentAnnouncements = await request('/api/announcements',student);
  assert.equal(studentAnnouncements.status,200);
  const studentAnnouncement=(await studentAnnouncements.json()).find((a:any)=>a.id===run.announcementId);
  assert.ok(studentAnnouncement);assert.match(studentAnnouncement.body,/1A #08/);
  assert.ok(!JSON.stringify(studentAnnouncement).includes('陳小明'));
  const studentDetail=await request('/api/announcements/'+run.announcementId,student);
  assert.equal(studentDetail.status,200);assert.ok(!(await studentDetail.text()).includes('陳小明'));
  const staffDetail=await request('/api/announcements/'+run.announcementId,chair);
  assert.equal(staffDetail.status,200);assert.ok((await staffDetail.text()).includes('陳小明'));
  await p.announcement.update({where:{id:run.announcementId!},data:{status:'DRAFT'}});
  assert.equal((await request('/api/announcements/'+run.announcementId,student)).status,404);
  await p.announcement.update({where:{id:run.announcementId!},data:{status:'PUBLISHED',publishAt:namedAnnouncement.publishAt}});
  assert.equal((await request('/api/announcements/'+run.announcementId,student)).status,404);
  assert.equal((await request('/api/activities/'+activity.id,student)).status,404);
  await p.activityAssignment.create({data:{activityId:activity.id,studentId:'as-student'}});
  const studentActivityList=await request('/api/activities',student);
  assert.equal(studentActivityList.status,200);
  const studentActivity=(await studentActivityList.json()).find((a:any)=>a.id===activity.id);
  assert.ok(studentActivity);assert.ok(!JSON.stringify(studentActivity).includes('陳小明'));
  const studentActivityDetail=await request('/api/activities/'+activity.id,student);
  assert.equal(studentActivityDetail.status,200);assert.ok(!(await studentActivityDetail.text()).includes('陳小明'));

  for (const [path, method] of [
    ["/api/activities/" + activity.id, "PATCH"],
    ["/api/activities/" + activity.id, "DELETE"],
    ["/api/activities/" + activity.id + "/alert", "POST"],
    ["/api/activities/" + activity.id + "/assign", "POST"],
    ["/api/activities/" + activity.id + "/review", "POST"],
    ["/api/announcements/" + run.announcementId, "PATCH"],
    ["/api/announcements/" + run.announcementId, "DELETE"],
    ["/api/calendar-events/" + activity.calendarEventId, "PATCH"],
    ["/api/calendar-events/" + activity.calendarEventId, "DELETE"],
  ])
    assert.equal((await request(path, chair, method, {})).status, 409, path);

  const before = (await (await request("/api/after-school/config")).json())
    .config;
  const nextYear = {
    spreadsheetId:
      "https://docs.google.com/spreadsheets/d/synthetic_sheet_2027/edit?gid=99",
    sheetTitle: "課後班2027",
    schoolYearStart: 2027,
    enabled: false,
    authorizeAutoApproval: false,
    expectedVersion: before.version,
  };
  assert.equal(
    (
      await request("/api/after-school/config", admin, "PUT", {
        ...nextYear,
        spreadsheetId: "https://evil.invalid/sheet",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/after-school/config", chair, "PUT", nextYear)).status,
    403,
  );
  assert.equal(
    (await request("/api/after-school/config", admin, "PUT", nextYear)).status,
    200,
  );
  const saved = (await (await request("/api/after-school/config")).json())
    .config;
  assert.equal(saved.spreadsheetId, "synthetic_sheet_2027");
  assert.equal(saved.schoolYearStart, 2027);
  assert.equal(
    (await request("/api/after-school/config", admin, "PUT", nextYear)).status,
    409,
  );
  const nextPreview = await request(
    "/api/after-school/preview",
    admin,
    "POST",
    { date: "2027-09-06" },
  );
  assert.equal(nextPreview.status, 200);
  const nextData = await nextPreview.json();
  assert.equal(nextData.rows.length, 2);
  assert.equal(nextData.errors.length, 0);
  assert.equal(nextData.title, "6/9 課後班名單");
  assert.equal(
    await p.announcement.count({ where: { id: run.announcementId! } }),
    1,
    "Previous academic year retained",
  );
  assert.equal(
    (
      await request("/api/after-school/config", admin, "PUT", {
        ...nextYear,
        spreadsheetId: before.spreadsheetId,
        sheetTitle: before.sheetTitle,
        schoolYearStart: before.schoolYearStart,
        expectedVersion: saved.version,
      })
    ).status,
    200,
  );
  console.log(
    "HTTP PASS: staff roles, origin, scheduler secret, disabled scheduler, preview privacy, stale preview, idempotent preparation nine managed mutation guards, source-link validation and next academic year retrieval",
  );
  // Expose local session only to an optional local browser process via a file.
  if (process.env.AFTERSCHOOL_BROWSER_SESSION_FILE) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      process.env.AFTERSCHOOL_BROWSER_SESSION_FILE,
      JSON.stringify({ admin, chair, teacher, student }),
      { mode: 0o600 },
    );
  }
}
main().finally(() => p.$disconnect());


