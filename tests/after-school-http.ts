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
  const data = await preview.json();
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
