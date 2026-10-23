import { test } from "node:test";
import assert from "node:assert/strict";
import { moveItem, resizeItem, mergeItems } from "../src/lib/blackboard/grid";
test("grid movement and resize stay within twelve columns", () => {
  const a = { id: "x", x: 8, y: 0, w: 4, h: 3 };
  assert.equal(moveItem(a, 9, -3).x, 8);
  assert.equal(resizeItem(a, 4, -4).w, 4);
  assert.equal(resizeItem(a, 4, -4).h, 2);
});
test("merge retains saved order and appends new cards without overlapping", () => {
  const a = { id: "memo", x: 0, y: 0, w: 4, h: 3 };
  const result = mergeItems([a], ["memo", "homework"]);
  assert.deepEqual(
    result.map((i) => i.id),
    ["memo", "homework"],
  );
  assert.ok(result[1].y >= 3);
});
