import test from "node:test";
import assert from "node:assert/strict";
import {
  conflictNote,
  isAcceptedConflictNote,
} from "../src/lib/after-school/conflicts";
test("accepted conflict notes are distinct from blocking errors", () => {
  assert.equal(conflictNote([]), null);
  assert.equal(isAcceptedConflictNote(null), false);
  assert.equal(isAcceptedConflictNote("來源讀取失敗"), false);
  assert.equal(
    isAcceptedConflictNote("備註：已確認接受時間重疊，仍按設定提醒。"),
    false,
  );
  assert.equal(
    isAcceptedConflictNote(conflictNote(["1A #08 與活動時間重疊"])),
    true,
  );
});


test("conflict note declares after-school priority and remains deliverable",()=>{
 const note=conflictNote(["1B #13 與合唱團時間重疊"]);
 assert.match(note!,/課後班優先/);
 assert.match(note!,/1B #13 與合唱團時間重疊/);
 assert.equal(isAcceptedConflictNote(note),true);
});
