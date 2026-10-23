import { createSign } from "node:crypto";
import ExcelJS from "exceljs";
import { AfterSchoolError } from "./http";
type Credentials = { client_email: string; private_key: string };
let cached:
  { email: string; key: string; token: string; expires: number } | undefined;
export function sourceCredentials(): Credentials {
  try {
    const v = JSON.parse(
      process.env.AFTERSCHOOL_GOOGLE_SERVICE_ACCOUNT_JSON || "{}",
    );
    if (
      typeof v.client_email !== "string" ||
      typeof v.private_key !== "string" ||
      !v.client_email.endsWith(".iam.gserviceaccount.com")
    )
      throw new Error();
    return { client_email: v.client_email, private_key: v.private_key };
  } catch {
    throw new AfterSchoolError(503, "未設定有效的Google只讀服務帳戶");
  }
}
export function sourceConfigured() {
  try {
    sourceCredentials();
    return true;
  } catch {
    return false;
  }
}
async function bytes(response: Response, max = 10 * 1024 * 1024) {
  if (!response.ok)
    throw new AfterSchoolError(
      503,
      `Google來源讀取失敗（${response.status}），請檢查分享及API設定`,
    );
  if (Number(response.headers.get("content-length") || 0) > max)
    throw new AfterSchoolError(413, "來源檔案太大");
  const reader = response.body?.getReader();
  if (!reader) throw new AfterSchoolError(503, "來源沒有資料");
  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      n += v.value.length;
      if (n > max) {
        await reader.cancel();
        throw new AfterSchoolError(413, "來源檔案太大");
      }
      chunks.push(v.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
async function accessToken(credentials: Credentials, fetcher: typeof fetch) {
  if (
    cached &&
    cached.email === credentials.client_email &&
    cached.key === credentials.private_key &&
    cached.expires > Date.now() + 60000
  )
    return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: credentials.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(credentials.private_key, "base64url");
  const r = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const data = JSON.parse((await bytes(r, 32768)).toString());
  if (typeof data.access_token !== "string")
    throw new AfterSchoolError(503, "Google未發出讀取憑證");
  cached = {
    email: credentials.client_email,
    key: credentials.private_key,
    token: data.access_token,
    expires: Date.now() + Math.min(Number(data.expires_in) || 300, 3600) * 1000,
  };
  return data.access_token;
}
export async function readSource(
  config: { spreadsheetId: string; sheetTitle: string },
  credentials = sourceCredentials(),
  fetcher: typeof fetch = fetch,
): Promise<unknown[][]> {
  const token = await accessToken(credentials, fetcher);
  const get = async (url: string) =>
    bytes(
      await fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      }),
    );
  const id = encodeURIComponent(config.spreadsheetId);
  const meta = JSON.parse(
    (
      await get(
        `https://www.googleapis.com/drive/v3/files/${id}?fields=id,mimeType&supportsAllDrives=true`,
      )
    ).toString(),
  );
  if (meta.mimeType === "application/vnd.google-apps.spreadsheet") {
    const range = encodeURIComponent(
      `'${config.sheetTitle.replace(/'/g, "''")}'!A1:G50001`,
    );
    const data = JSON.parse(
      (
        await get(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
        )
      ).toString(),
    );
    if (!Array.isArray(data.values))
      throw new AfterSchoolError(422, "來源工作表沒有表頭");
    return data.values;
  }
  if (
    meta.mimeType !==
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    throw new AfterSchoolError(422, "來源必須為Google試算表或xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    (await get(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    )) as unknown as ArrayBuffer,
  );
  const ws = wb.getWorksheet(config.sheetTitle);
  if (!ws || ws.rowCount > 50001)
    throw new AfterSchoolError(422, "工作表不存在或超過50000行");
  const values: unknown[][] = [];
  for (let i = 1; i <= ws.rowCount; i++)
    values.push(
      Array.from({ length: 7 }, (_, n) => {
        const v = ws.getRow(i).getCell(n + 1).value;
        if (v && typeof v === "object" && !(v instanceof Date)) {
          if ("result" in v) return v.result;
          if ("richText" in v) return v.richText.map((t) => t.text).join("");
        }
        return v;
      }),
    );
  return values;
}
