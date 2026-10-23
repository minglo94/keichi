import { test } from "node:test";
import assert from "node:assert/strict";
import { configSchema } from "../src/lib/after-school/validation";
const id = "synthetic_sheet_2027";
const config = {
  sheetTitle: "課後班",
  schoolYearStart: 2027,
  enabled: false,
  authorizeAutoApproval: false,
  expectedVersion: 1,
};
test("configuration accepts private Sheets/Drive links and stores only their file ID", () => {
  for (const value of [
    id,
    "https://docs.google.com/spreadsheets/d/" + id + "/edit?gid=123#gid=123",
    "https://docs.google.com/spreadsheets/u/0/d/" + id + "/edit",
    "https://drive.google.com/file/d/" + id + "/view",
    "https://drive.google.com/open?id=" + id,
  ]) {
    assert.equal(
      configSchema.parse({ ...config, spreadsheetId: value }).spreadsheetId,
      id,
    );
  }
});
test("source links reject foreign hosts, published sheets and incomplete links", () => {
  for (const value of [
    "https://evil.invalid/" + id,
    "https://docs.google.com.evil.invalid/spreadsheets/d/" + id + "/edit",
    "https://docs.google.com/spreadsheets/d/e/" + id + "/pubhtml",
    "http://docs.google.com/spreadsheets/d/" + id + "/edit",
    "https://user:password@docs.google.com/spreadsheets/d/" + id + "/edit",
    "https://docs.google.com/spreadsheets/d/short/edit",
  ]) {
    assert.equal(
      configSchema.safeParse({ ...config, spreadsheetId: value }).success,
      false,
      value,
    );
  }
});
