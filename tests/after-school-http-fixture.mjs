// Only loaded by the disposable local HTTP verification process, never by app code.
if (
  process.env.AFTERSCHOOL_LOCAL_HTTP_TEST !== "synthetic-only" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
) {
  throw new Error("Local disposable database required");
}
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url === "https://oauth2.googleapis.com/token")
    return Response.json({ access_token: "synthetic", expires_in: 300 });
  if (
    url.startsWith(
      "https://www.googleapis.com/drive/v3/files/synthetic_source_id?fields=",
    )
  )
    return Response.json({
      mimeType: "application/vnd.google-apps.spreadsheet",
    });
  if (
    url.startsWith(
      "https://sheets.googleapis.com/v4/spreadsheets/synthetic_source_id/values/",
    )
  )
    return Response.json({
      values: [
        ["班別", "學號", "姓名", "日期", "類型", "出席", "備註"],
        ["1A", 8, "PRIVATE", "2026-11-09", "功課班"],
        ["2F", 15, "PRIVATE", "2026-11-09", "正向班"],
      ],
    });
  if (url.startsWith("https://") && /googleapis.com/.test(url))
    throw new Error("Unexpected Google test endpoint");
  return original(input, options);
};
