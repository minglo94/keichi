import test from "node:test";
import assert from "node:assert/strict";
import {
  lessonCells,
  dateWindow,
  shiftDate,
} from "../src/lib/blackboard/daily";
import type { TimetableRow } from "../src/lib/blackboard/types";
test("daily timetable has ten cells and combines parallel subjects without losing groups", () => {
  const rows: TimetableRow[] = [
    {
      id: "a",
      day: 1,
      period: 3,
      subject: "生物",
      groupCode: "S5-X1",
      groupLabel: "選修一",
    },
    {
      id: "b",
      day: 1,
      period: 3,
      subject: "化學",
      groupCode: "S5-X1",
      groupLabel: "選修一",
    },
    {
      id: "c",
      day: 1,
      period: 3,
      subject: "生物",
      groupCode: "S5-X1",
      groupLabel: "選修一",
    },
    {
      id: "d",
      day: 1,
      period: 7,
      subject: "英文",
      groupCode: "S5-G1",
      groupLabel: "分組課",
    },
    {
      id: "e",
      day: 1,
      period: 7,
      subject: "英文",
      groupCode: "S5-G2",
      groupLabel: "分組課",
    },
  ];
  const cells = lessonCells(rows, [], 1);
  assert.equal(cells.length, 10);
  assert.deepEqual(
    cells[2].lessons.map((r) => r.subject),
    ["生物", "化學"],
  );
  assert.equal(cells[6].lessons.length, 2);
  assert.equal(cells[0].period, 1);
  assert.equal(cells[9].period, 10);
  assert.equal(lessonCells(rows, [], 0).length, 0);
});
test("dates reject rollover and preserve Hong Kong day boundaries", () => {
  assert.throws(() => dateWindow("2026-02-29"));
  assert.throws(() => dateWindow("nope"));
  assert.equal(
    dateWindow("2028-02-29").start.toISOString(),
    "2028-02-28T16:00:00.000Z",
  );
  assert.equal(
    dateWindow("2026-10-23").end.toISOString(),
    "2026-10-23T16:00:00.000Z",
  );
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
});
