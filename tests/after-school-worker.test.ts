import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
test("morning and afternoon pushes retain distinct notification stages", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: {
    title: string;
    options: { tag: string; renotify: boolean };
  }[] = [];
  const self = {
    addEventListener: (kind: string, fn: (event: unknown) => void) =>
      (listeners[kind] = fn),
    registration: {
      showNotification: async (
        title: string,
        options: { tag: string; renotify: boolean },
      ) => {
        shown.push({ title, options });
      },
    },
  };
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self },
  );
  for (const stage of ["MORNING", "AFTERNOON"]) {
    let pending: Promise<void> | undefined;
    listeners.push({
      data: {
        json: () => ({
          title: "課後班",
          body: "1A #08",
          link: "/student/activities",
          tag: "after-school:2026-10-26:" + stage,
        }),
      },
      waitUntil: (promise: Promise<void>) => {
        pending = promise;
      },
    });
    await pending;
  }
  assert.notEqual(shown[0].options.tag, shown[1].options.tag);
  assert.equal(shown[1].options.renotify, true);
});
