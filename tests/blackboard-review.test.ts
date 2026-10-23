import { test } from "node:test";
import assert from "node:assert/strict";
import { subjectsForClass } from "../src/lib/blackboard/projection";
import {
  rebaseLayoutDraft,
  defaultBoardItems,
  gridDelta,
} from "../src/lib/blackboard/grid";
import { boardApi } from "../src/lib/blackboard/request";
test("combined class grants both classes, ambiguous prefix grants neither", () => {
  const rows = [
    { classCode: "1A/1B", subject: "英文" },
    { classCode: "1AB", subject: "中文" },
  ];
  assert.deepEqual(subjectsForClass(rows, "1B"), ["英文"]);
  assert.deepEqual(
    subjectsForClass([{ classCode: "1AB", subject: "中文" }], "1A"),
    [],
  );
});
test("explicit rebase preserves draft positions and adopts reviewed version", () => {
  const items = [{ id: "timetable", x: 0, y: 2, w: 8, h: 6 }];
  const next = rebaseLayoutDraft(items, 7);
  assert.equal(next.version, 7);
  assert.deepEqual(next.items, items);
});
test("first insert uniqueness conflict is 409, not a connection failure", async () => {
  const r = await boardApi(async () => {
    throw { code: "P2002" };
  });
  assert.equal(r.status, 409);
});
test("editor and viewer share defaults, row movement includes grid gap", () => {
  const items = defaultBoardItems([], ["timetable", "homework", "missing"]);
  assert.equal(items.find((x) => x.id === "homework")?.x, 8);
  assert.deepEqual(gridDelta(0, 160, 80), { dx: 0, dy: 2 });
});
import { slotForLesson } from "../src/lib/blackboard/projection";
test("named lesson cannot borrow numbered lesson time with same label", () => {
  assert.equal(
    slotForLesson(
      { id: "assembly", day: 1, period: 0, label: "早會", subject: "早會" },
      [
        {
          id: "p1",
          period: 1,
          label: "早會",
          kind: "LESSON",
          startTime: "09:00",
          endTime: "10:00",
        },
      ],
    ),
    undefined,
  );
});
