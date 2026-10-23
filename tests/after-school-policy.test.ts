import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveParticipants,
  deliveryOutcome,
  canAttemptPush,
} from "../src/lib/after-school/policy";
test("class + number resolves uniquely without names and duplicate class rejects", () => {
  const rows = [{ className: "1A", number: "08", type: "TOOL_UP" as const }];
  const roster = [
    {
      studentId: "s",
      role: "STUDENT",
      className: "1A",
      number: "8",
      classId: "a",
    },
  ];
  assert.equal(resolveParticipants(rows, roster).rows[0].studentId, "s");
  assert.ok(
    resolveParticipants(rows, [...roster, { ...roster[0], studentId: "other" }])
      .errors.length,
  );
});
test("accepted or unknown push attempts cannot be automatically retried", () => {
  assert.equal(canAttemptPush("ACCEPTED"), false);
  assert.equal(canAttemptPush("UNKNOWN"), false);
  assert.equal(canAttemptPush("SENDING"), false);
  assert.equal(canAttemptPush("PENDING"), true);
  assert.equal(deliveryOutcome(new Error("timeout")), "UNKNOWN");
  assert.equal(deliveryOutcome({ statusCode: 410 }), "EXPIRED");
  assert.equal(deliveryOutcome({ statusCode: 429 }), "FAILED");
});

test("one resolved student cannot occupy two source identities", () => {
  const rows = [
    { className: "1A", number: "08", type: "TOOL_UP" as const },
    { className: "2F", number: "15", type: "POSITIVE" as const },
  ];
  const roster = rows.map((r, i) => ({
    ...r,
    studentId: "same",
    role: "STUDENT",
    classId: String(i),
  }));
  assert.ok(resolveParticipants(rows, roster).errors.length);
});
