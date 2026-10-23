import { test } from "node:test";
import assert from "node:assert/strict";
import { presetClassPlan } from "../src/lib/blackboard/preset-policy";
test("preset uses lower case class names and excludes group records", () => {
  const plan = presetClassPlan([
    { id: "a", name: " 1A " },
    { id: "b", name: "5a" },
    { id: "g", name: "S4-X1" },
  ]);
  assert.deepEqual(
    plan.classes.map((c) => c.password),
    ["keichi1a", "keichi5a"],
  );
  assert.equal(plan.skipped, 1);
});
test("ambiguous class login names abort the batch", () => {
  assert.throws(
    () =>
      presetClassPlan([
        { id: "a", name: "1A" },
        { id: "b", name: " 1a " },
      ]),
    /重複/,
  );
});
