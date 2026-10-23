// Optional end-to-end runner. Install Playwright separately; use local synthetic DB only.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const { chromium: pw } = await import(
  process.env.BLACKBOARD_PLAYWRIGHT_MODULE || "playwright"
);
const packed = process.env.BLACKBOARD_CHROMIUM_MODULE
  ? (await import(process.env.BLACKBOARD_CHROMIUM_MODULE)).default
  : null;
const url = process.env.BLACKBOARD_TEST_URL || "http://127.0.0.1:3100";
if (
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL || "http://invalid").hostname,
  )
)
  throw new Error("Local synthetic database required");
const p = new PrismaClient();
const launch = () =>
  pw.launch(
    packed
      ? {
          executablePath:
            process.env.BLACKBOARD_CHROME_EXECUTABLE || packed.executablePath(),
          args: [
            "--no-sandbox",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--no-zygote",
            "--single-process",
            "--disable-dev-shm-usage",
          ],
          headless: true,
        }
      : { headless: true },
  );
const browser = await launch();
const teacherBrowser = await launch();
const mobileBrowser = await launch();
const errors = [];
try {
  const password = await bcrypt.hash("synthetic123", 4);
  await p.user.create({
    data: {
      id: "ui-owner",
      email: "ui-owner@example.invalid",
      name: "UI teacher",
      role: "ADMIN",
      password,
      departments: [],
      committees: [],
    },
  });
  await p.class.create({
    data: {
      id: "ui-class",
      name: "2A",
      classCode: "ui-2a",
      teacherId: "ui-owner",
      homeroomTeacherId: "ui-owner",
    },
  });
  await p.blackboardAccess.create({
    data: {
      classId: "ui-class",
      passwordHash: await bcrypt.hash("classboard123", 4),
      enabled: true,
    },
  });
  await p.blackboardTimetable.create({
    data: {
      classId: "ui-class",
      source: "MANUAL",
      rows: [{ id: "ui-lesson", day: 1, period: 1, subject: "英文" }],
    },
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url + "/blackboard/login");
  await page.getByLabel("班別", { exact: true }).fill("2A");
  await page.getByLabel("班級密碼", { exact: true }).fill("classboard123");
  await page.getByRole("button", { name: "進入班級黑板" }).click();
  await page.waitForURL("**/blackboard");
  await page.getByRole("heading", { name: "2A 電子黑板" }).waitFor();
  await page.getByRole("button", { name: "全週", exact: true }).click();
  await page.getByText("星期一", { exact: true }).waitFor();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  const css = await page
    .locator(".board-tile")
    .first()
    .evaluate((el) => ({
      x: getComputedStyle(el).gridColumnStart,
      row: getComputedStyle(el).gridRowStart,
    }));
  assert.ok(css.x !== "auto");
  const teacher = await teacherBrowser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const csrfResponse = await fetch(url + "/api/auth/csrf");
  const csrfData = await csrfResponse.json();
  const csrfCookies = csrfResponse.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const signed = await fetch(url + "/api/auth/callback/credentials", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      origin: url,
      cookie: csrfCookies,
    },
    body: new URLSearchParams({
      csrfToken: csrfData.csrfToken,
      email: "ui-owner@example.invalid",
      password: "synthetic123",
      callbackUrl: url + "/teacher/dashboard",
    }),
  });
  const sessionCookies = signed.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("session-token"));
  assert.ok(sessionCookies.length, "teacher login must issue session");
  await teacher.addCookies(
    sessionCookies.map((c) => ({
      name: c.slice(0, c.indexOf("=")),
      value: c.slice(c.indexOf("=") + 1),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    })),
  );
  teacher.setDefaultTimeout(15000);
  await teacher.addInitScript(() =>
    localStorage.setItem("ichi-visited", "true"),
  );
  const edit = await teacher.newPage();
  edit.on("pageerror", (e) => errors.push(e.message));
  await edit.goto(url + "/teacher/classes/ui-class/blackboard");
  await edit.getByRole("heading", { name: "2A · 黑板管理" }).waitFor();
  // Existing onboarding is unrelated; suppress its previously seen tour state if present.
  await edit.getByRole("button", { name: "＋ 新增公告／便條" }).click();
  await edit.getByLabel("類型", { exact: true }).selectOption("DETENTION");
  await edit.getByLabel("標題", { exact: true }).fill("UI 留堂測試");
  await edit.getByLabel("內容", { exact: true }).fill("請帶備英文練習");
  await edit.getByLabel("學號（以逗號分隔）").fill("08, 15");
  await edit.getByLabel("日期", { exact: true }).fill("2026-10-26");
  await edit.getByLabel("地點", { exact: true }).fill("Room 201");
  await edit.getByLabel("開始時間", { exact: true }).fill("15:45");
  await edit.getByLabel("結束時間", { exact: true }).fill("16:30");
  await edit.getByRole("button", { name: "發布／儲存" }).click();
  await edit
    .getByRole("heading", { name: "UI 留堂測試", exact: true })
    .waitFor();
  // Exercise the actual 30-second update rather than manually fetching the viewer.
  await page
    .getByRole("heading", { name: "UI 留堂測試", exact: true })
    .waitFor({ timeout: 40000 });
  await page.getByText("2A · 08號、15號", { exact: true }).waitFor();
  await page.getByText("Room 201", { exact: true }).waitFor();
  await edit.getByRole("button", { name: "黑板排版", exact: true }).click();
  await edit.getByRole("button", { name: "加高", exact: true }).first().click();
  await edit.getByRole("button", { name: "儲存共用版面", exact: true }).click();
  await edit.getByText("全班共用版面已儲存", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/keichi-blackboard-desktop.png",
    fullPage: true,
  });
  const saved = await p.blackboardLayout.findUniqueOrThrow({
    where: { classId: "ui-class" },
  });
  assert.equal(saved.items[0].h, 7);
  await edit.reload();
  await edit.getByRole("button", { name: "黑板排版", exact: true }).click();
  const handle = edit
    .getByRole("button", { name: "拖放或用方向鍵移動", exact: true })
    .first();
  await handle.focus();
  await handle.press("ArrowDown");
  await edit.getByRole("button", { name: "儲存共用版面", exact: true }).click();
  await edit.getByText("全班共用版面已儲存", { exact: true }).waitFor();
  assert.equal(
    (
      await p.blackboardLayout.findUniqueOrThrow({
        where: { classId: "ui-class" },
      })
    ).items[0].y,
    1,
  );
  // Pointer drag and resize use the same grid normalization as keyboard.
  const drag = await handle.boundingBox();
  await edit.mouse.move(drag.x + 5, drag.y + 5);
  await edit.mouse.down();
  await edit.mouse.move(drag.x + 5, drag.y + 75, { steps: 6 });
  await edit.mouse.up();
  await edit.getByRole("button", { name: "儲存共用版面", exact: true }).click();
  await edit.getByText("全班共用版面已儲存", { exact: true }).waitFor();
  assert.equal(
    (
      await p.blackboardLayout.findUniqueOrThrow({
        where: { classId: "ui-class" },
      })
    ).items[0].y,
    2,
  );
  const mobile = await mobileBrowser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.setDefaultTimeout(15000);
  const m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(url + "/blackboard/login");
  await m.getByLabel("班別", { exact: true }).fill("2A");
  await m.getByLabel("班級密碼", { exact: true }).fill("classboard123");
  await m.getByRole("button", { name: "進入班級黑板" }).click();
  await m.waitForURL("**/blackboard");
  await m.getByRole("heading", { name: "UI 留堂測試" }).waitFor();
  assert.equal(
    await m
      .locator(".board-tile")
      .first()
      .evaluate((el) => getComputedStyle(el).gridColumnStart),
    "auto",
  );
  assert.ok(
    await m.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await m.screenshot({
    path: "/tmp/keichi-blackboard-mobile.png",
    fullPage: true,
  });
  // Save password through the teacher UI and confirm another device loses access.
  await edit.getByRole("button", { name: "時間表與登入", exact: true }).click();
  await edit.getByLabel("重設密碼（留空保留）").fill("newboard123");
  await edit.getByRole("button", { name: "儲存登入設定", exact: true }).click();
  await edit
    .getByText("設定已更新，舊班級會話已撤銷", { exact: true })
    .waitFor();
  await m.getByRole("button", { name: "重新整理", exact: true }).click();
  await m.waitForURL("**/blackboard/login");
  assert.deepEqual(errors, []);
  console.log(
    "BROWSER PASS: desktop/mobile class login, weekly timetable, structured detention, 30-second live update, saved layout, keyboard move, pointer drag, password reset and old-device eviction",
  );
  await context.close();
  await teacher.close();
  await mobile.close();
} finally {
  await browser.close();
  await teacherBrowser.close();
  await mobileBrowser.close();
  await p.$disconnect();
}
