import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRows,
  scheduleFor,
  formatAnnouncement,
  dueStages,
} from "../src/lib/after-school/model";
const headers = ["班別", "學號", "姓名", "日期", "類型", "出席", "備註"];
test("announcement displays matched names by class and number, with explicit missing-name fallback", () => {
  const rows = [
    {className:"1A",number:"08",type:"TOOL_UP" as const},
    {className:"1A",number:"15",type:"TOOL_UP" as const},
    {className:"2F",number:"23",type:"POSITIVE" as const},
  ];
  const names = new Map([["1A#08"," 陳小明 "],["1A#15","李小華"],["2F#23"," "]]);
  const result = formatAnnouncement("2026-10-26",rows,names);
  assert.match(result.body,/1A #08 陳小明、#15 李小華/);
  assert.match(result.body,/2F #23（姓名未設定）/);
  assert.match(formatAnnouncement("2026-10-27",rows,names).body,/4:00 pm/);
  assert.ok(!formatAnnouncement("2026-10-26",rows,new Map([["1A#08","陳\n小明"]])).body.includes("陳\n小明"));
});
test("Monday lasts one hour and afternoon reminder is 14:00", () => {
  assert.deepEqual(scheduleFor("2026-10-26"), {
    start: "15:30",
    end: "16:30",
    remind: "14:00",
  });
  assert.equal(scheduleFor("2026-10-27")?.remind, "15:45");
  assert.equal(scheduleFor("2026-10-24"), null);
});
test("parse dedupes, preserves numbers, ignores name/note and blank templates", () => {
  const r = parseRows(
    [
      headers,
      ["1A", 8, "PRIVATE", "26/10/2026", "Tool UP / 功課班", false, "SECRET"],
      ["1A", "08", "PRIVATE", "2026-10-26", "Tool UP / 功課班"],
      [null, null, null, null, "正向班", false],
    ],
    "2026-10-26",
    2026,
  );
  assert.equal(r.errors.length, 0);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].number, "08");
  assert.ok(!JSON.stringify(r).includes("PRIVATE"));
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.match(formatAnnouncement("2026-10-26", r.rows).body, /1A #08/);
});
test("dates use school year and serial and never assume m/d", () => {
  const r = parseRows(
    [
      headers,
      ["1A", 15, "", "26/10", "正向班"],
      [
        "1A",
        23,
        "",
        Math.floor((Date.UTC(2026, 9, 26) - Date.UTC(1899, 11, 30)) / 86400000),
        "正向班",
      ],
    ],
    "2026-10-26",
    2026,
  );
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0]?.number, "15");
  assert.equal(r.errors.length, 0);
});
test("incomplete records, unknown type and two groups block run", () => {
  assert.ok(
    parseRows(
      [headers, ["1A", 8, "", "2026-10-26", "unknown"]],
      "2026-10-26",
      2026,
    ).errors.length,
  );
  assert.ok(
    parseRows([headers, ["1A", 8, "", null, "正向班"]], "2026-10-26", 2026)
      .errors.length,
  );
  assert.ok(
    parseRows(
      [
        headers,
        ["1A", 8, "", "2026-10-26", "正向班"],
        ["1A", 8, "", "2026-10-26", "功課班"],
      ],
      "2026-10-26",
      2026,
    ).errors.length,
  );
});
test("first reminder is 08:15, stages do not overlap or catch up after start", () => {
  assert.deepEqual(
    dueStages("2026-10-26", new Date("2026-10-26T07:00:00+08:00")),
    [],
  );
  assert.deepEqual(
    dueStages("2026-10-26", new Date("2026-10-26T08:15:00+08:00")),
    ["MORNING"],
  );
  assert.deepEqual(
    dueStages("2026-10-27", new Date("2026-10-27T08:15:00+08:00")),
    ["MORNING"],
  );

  assert.deepEqual(
    dueStages("2026-10-26", new Date("2026-10-26T08:14:59+08:00")),
    [],
  );
  assert.deepEqual(
    dueStages("2026-10-26", new Date("2026-10-26T14:00:00+08:00")),
    ["AFTERNOON"],
  );
  assert.deepEqual(
    dueStages("2026-10-26", new Date("2026-10-26T15:30:00+08:00")),
    [],
  );
});

