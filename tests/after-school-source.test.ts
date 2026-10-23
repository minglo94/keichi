import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readSource } from "../src/lib/after-school/source";
test("read-only Google adapter fixes endpoints and validates signed scope", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const credentials = {
    client_email: "synthetic@test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  const calls: string[] = [];
  const fake = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = (init!.body as URLSearchParams).get("assertion")!;
      const [a, b, s] = assertion.split(".");
      assert.equal(
        verify(
          "RSA-SHA256",
          Buffer.from(`${a}.${b}`),
          publicKey,
          Buffer.from(s, "base64url"),
        ),
        true,
      );
      const claims = JSON.parse(Buffer.from(b, "base64url").toString());
      assert.match(claims.scope, /spreadsheets.readonly/);
      assert.match(claims.scope, /drive.readonly/);
      return Response.json({
        access_token: "synthetic-token",
        expires_in: 300,
      });
    }
    if (url.includes("/drive/v3/files/"))
      return Response.json({
        mimeType: "application/vnd.google-apps.spreadsheet",
      });
    assert.ok(
      url.startsWith(
        "https://sheets.googleapis.com/v4/spreadsheets/synthetic_source_id/values/",
      ),
    );
    assert.equal(init?.cache, "no-store");
    return Response.json({ values: [["班別", "學號", "日期", "類型"]] });
  };
  const rows = await readSource(
    { spreadsheetId: "synthetic_source_id", sheetTitle: "工作表1" },
    credentials,
    fake as typeof fetch,
  );
  assert.equal(rows.length, 1);
  assert.equal(calls.length, 3);
});
