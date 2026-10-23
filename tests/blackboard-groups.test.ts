import { test } from "node:test";
import assert from "node:assert/strict";
import { projectImportedTimetable } from "../src/lib/blackboard/imported-timetable";
const row = (id: string, classCode: string, subject: string | null) => ({
  id,
  classCode,
  subject,
  dayOfWeek: 1,
  period: 2,
  periodLabel: null,
});
test("S4-X1 keeps every actual elective subject for the same year", () => {
  const result = projectImportedTimetable(
    [
      row("p", "S4-X1", "物理"),
      row("b", "S4-X1", "生物"),
      row("p2", "S4-X1", "物理"),
      row("other", "S5-X1", "化學"),
    ],
    "4A",
  );
  assert.deepEqual(
    result.rows.map((r) => r.subject),
    ["物理", "生物"],
  );
  assert.equal(result.rows[0].groupCode, "S4-X1");
  assert.equal(result.rows[0].groupLabel, "選修一");
  assert.equal(result.hasYearGroups, true);
});
test("S3- G1 accepts spaces and preserves Chinese English and maths separately", () => {
  const result = projectImportedTimetable(
    [
      row("c", "S3- G1", "中文"),
      row("e", "S3-G1", "英文"),
      row("m", "S3-G1", "數學"),
    ],
    "3B",
  );
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].groupLabel, "中文／英文／數學分組");
  assert.equal(
    projectImportedTimetable([row("c", "S3-G1", "中文")], "4A").rows.length,
    0,
  );
});
test("direct lessons remain class scoped; separate groups with the same subject stay separate", () => {
  const result = projectImportedTimetable(
    [
      row("a", "4A", "中文"),
      row("z", "4B", "地理"),
      row("x1", "S4-X1", "歷史"),
      row("x2", "S4-X2", "歷史"),
      row("bad", "S4-X1", null),
    ],
    "4A",
  );
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].groupCode, undefined);
  assert.deepEqual(
    result.rows.slice(1).map((r) => r.groupCode),
    ["S4-X1", "S4-X2"],
  );
});

test("explicit combined group codes retain both options with unique row ids", () => {
  const result = projectImportedTimetable(
    [row("combined", "S4-X1/S4-X2", "歷史")],
    "4A",
  );
  assert.deepEqual(
    result.rows.map((r) => r.groupCode),
    ["S4-X1", "S4-X2"],
  );
  assert.equal(new Set(result.rows.map((r) => r.id)).size, 2);
});
