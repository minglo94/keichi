import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLessonState,
  codeMatchesClass,
  isPublished,
  projectMissing,
} from "../src/lib/blackboard/projection";
const slots = [
  {
    id: "p1",
    period: 1,
    label: "第一節",
    kind: "LESSON" as const,
    startTime: "08:25",
    endTime: "09:00",
  },
  {
    id: "b",
    period: null,
    label: "小息",
    kind: "BREAK" as const,
    startTime: "09:00",
    endTime: "09:20",
  },
];
const rows = [
  { id: "e", day: 1, period: 1, subject: "English" },
  { id: "c", day: 1, period: 1, subject: "中文" },
];
test("weekday currently running same-period lessons are preserved", () =>
  assert.deepEqual(
    getLessonState(rows, slots, new Date("2026-10-26T08:30:00+08:00"))
      .currentIds,
    ["e", "c"],
  ));
test("break, weekend and HK midnight do not highlight wrong day", () => {
  assert.equal(
    getLessonState(rows, slots, new Date("2026-10-26T09:00:00+08:00")).status,
    "小息",
  );
  assert.equal(
    getLessonState(rows, slots, new Date("2026-10-24T00:00:00+08:00")).status,
    "週末",
  );
  assert.deepEqual(
    getLessonState(rows, slots, new Date("2026-10-25T16:30:00Z")).nextIds,
    ["e", "c"],
  );
});
test("exact and explicit combined class codes never substring match", () => {
  assert.equal(codeMatchesClass("F.1A", "1A"), true);
  assert.equal(codeMatchesClass("1A-ENG", "1A"), true);
  assert.equal(codeMatchesClass("1A/1B", "1B"), true);
  assert.equal(codeMatchesClass("1AB", "1A"), false);
  assert.equal(codeMatchesClass("1A/1B", "1C"), false);
});
test("publication is half-open and excludes archived cards", () => {
  const now = new Date("2026-10-23T00:00Z");
  assert.equal(
    isPublished(
      { startsAt: now, endsAt: new Date(+now + 1), archivedAt: null },
      now,
    ),
    true,
  );
  assert.equal(
    isPublished({ startsAt: null, endsAt: now, archivedAt: null }, now),
    false,
  );
});
test("missing projection filters resolved and strips private notes", () => {
  const result = projectMissing(
    [
      {
        resolved: false,
        kind: "MISSING_HOMEWORK",
        studentId: "secret",
        date: new Date("2026-10-23T00:00Z"),
        subject: "中文",
        homework: { title: "練習" },
      },
      {
        resolved: true,
        kind: "MISSING_HOMEWORK",
        studentId: "secret",
        date: new Date(),
        subject: null,
        homework: null,
      },
      {
        resolved: false,
        kind: "HOMEWORK_ABSENT",
        studentId: "absent",
        date: new Date(),
        subject: "英文",
        homework: { title: "Dictation" },
      },
    ],
    [{ studentId: "secret", classNumber: "08" }],
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].number, "08");
  assert.equal(result[1].absent, true);
  assert.equal(result[1].number, "未設定");
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});
