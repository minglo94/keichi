import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionIsValid,
  hashToken,
  canonicalClassName,
  canManageBoard,
  canEditCard,
} from "../src/lib/blackboard/policy";
test("session expires at boundary and is revoked by version or disable", () => {
  const now = new Date("2026-10-23T00:00Z");
  const s = { expiresAt: new Date(+now + 1), sessionVersion: 2 };
  const a = { enabled: true, sessionVersion: 2 };
  assert.equal(sessionIsValid(s, a, now), true);
  assert.equal(sessionIsValid({ ...s, expiresAt: now }, a, now), false);
  assert.equal(sessionIsValid(s, { ...a, enabled: false }, now), false);
  assert.equal(sessionIsValid(s, { ...a, sessionVersion: 3 }, now), false);
});
test("tokens stored as hashes and normalized class identity is exact", () => {
  assert.equal(hashToken("secret").length, 64);
  assert.notEqual(hashToken("secret"), "secret");
  assert.equal(canonicalClassName(" 1a "), "1A");
  assert.notEqual(canonicalClassName("1A"), canonicalClassName("1B"));
});
test("subject teacher cannot edit another card or shared layout", () => {
  assert.equal(canManageBoard("timetable"), false);
  assert.equal(canManageBoard("homeroom"), true);
  assert.equal(canEditCard(false, "one", "two"), false);
  assert.equal(canEditCard(true, "one", "two"), true);
});
import { uniqueClassId } from "../src/lib/blackboard/policy";
test("stored canonical collisions include tabs and full-width whitespace", () => {
  assert.equal(
    uniqueClassId(
      [
        { id: "a", name: "1A" },
        { id: "b", name: "\t1a\u3000" },
      ],
      " 1A ",
    ),
    null,
  );
  assert.equal(uniqueClassId([{ id: "a", name: "\t1a\u3000" }], "1A"), "a");
});
