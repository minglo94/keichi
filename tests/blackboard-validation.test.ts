import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardInputSchema,
  layoutInputSchema,
  timetableInputSchema,
  scheduleInputSchema,
} from "../src/lib/blackboard/validation";
const detention = {
  type: "DETENTION",
  title: "留堂",
  body: "",
  color: "amber",
  pinned: false,
  startsAt: null,
  endsAt: null,
  subject: null,
  payload: {
    studentNumbers: ["08"],
    date: "2026-10-26",
    startTime: "15:45",
    endTime: "16:30",
    location: "201",
  },
};
test("valid detention preserves structured fields", () =>
  assert.equal(cardInputSchema.safeParse(detention).success, true));
test("rejects impossible dates, reversed times and hidden payload fields", () => {
  for (const payload of [
    { ...detention.payload, date: "2026-02-30" },
    { ...detention.payload, endTime: "15:00" },
    { ...detention.payload, name: "secret" },
  ])
    assert.equal(
      cardInputSchema.safeParse({ ...detention, payload }).success,
      false,
    );
});
test("publication window and unsafe links rejected", () => {
  assert.equal(
    cardInputSchema.safeParse({
      ...detention,
      startsAt: "2026-10-27T00:00:00+08:00",
      endsAt: "2026-10-26T00:00:00+08:00",
    }).success,
    false,
  );
  assert.equal(
    cardInputSchema.safeParse({ ...detention, link: "javascript:alert(1)" })
      .success,
    false,
  );
});
test("layout rejects duplicates, invalid positions and oversized cards", () => {
  const a = { id: "homework", x: 0, y: 0, w: 4, h: 3 };
  assert.equal(
    layoutInputSchema.safeParse({ items: [a], expectedVersion: 0 }).success,
    true,
  );
  for (const items of [[a, a], [{ ...a, x: -1 }], [{ ...a, x: 10 }]])
    assert.equal(
      layoutInputSchema.safeParse({ items, expectedVersion: 0 }).success,
      false,
    );
});
test("manual timetable is weekday only and schedule rejects overlap", () => {
  assert.equal(
    timetableInputSchema.safeParse({
      source: "MANUAL",
      rows: [{ id: "a", day: 6, period: 1, subject: "English" }],
      expectedVersion: 0,
    }).success,
    false,
  );
  assert.equal(
    scheduleInputSchema.safeParse({
      expectedVersion: 0,
      slots: [
        {
          id: "1",
          period: 1,
          label: "第一節",
          kind: "LESSON",
          startTime: "09:00",
          endTime: "10:00",
        },
        {
          id: "2",
          period: 2,
          label: "第二節",
          kind: "LESSON",
          startTime: "09:30",
          endTime: "10:30",
        },
      ],
    }).success,
    false,
  );
});
