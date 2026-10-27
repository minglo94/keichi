"use client";
import { AfterSchoolSetupGuide } from "./AfterSchoolSetupGuide";
import { useCallback, useEffect, useState } from "react";
type Config = {
  spreadsheetId: string;
  sheetTitle: string;
  schoolYearStart: number;
  enabled: boolean;
  version: number;
};
type Preview = {
  date: string;
  hash: string;
  title: string;
  body: string;
  errors: string[];
  warnings: string[];
  skipped: boolean;
  reason: string | null;
  rows: unknown[];
};
type Status = {
  date: string;
  status: string;
  lastError: string | null;
  preparedAt: string | null;
  groups: { type: string; activityId: string }[];
  reminders: {
    stage: string;
    status: string;
    attempts: { status: string }[];
  }[];
};
const localDate = () =>
  new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
async function getJSON(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "未能完成操作");
  return j;
}
export function AfterSchoolPanel({
  onPublished,
  settingsOnly = false,
}: {
  onPublished?: () => Promise<void>;
  settingsOnly?: boolean;
}) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(settingsOnly);
  const [config, setConfig] = useState<Config | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState({
    source: false,
    push: false,
    scheduler: false,
  });
  const [date, setDate] = useState(localDate());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runs, setRuns] = useState<Status[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/after-school/config", { cache: "no-store" });
    if (r.status === 403) {
      setAllowed(false);
      return;
    }
    const c = await r.json();
    if (!r.ok) throw new Error(c.error);
    setAllowed(true);
    setConfig(c.config);
    setIsAdmin(c.isAdmin);
    setReady(c.readiness);
    if (!settingsOnly) setRuns(await getJSON("/api/after-school/status"));
  }, [settingsOnly]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function operation(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能完成操作");
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return null;
  return (
    <section className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h3">
            {settingsOnly
              ? "課後班 Google Sheet 來源及學年設定"
              : "課後班每日自動整理"}
          </h2>
          <p
            className="text-caption mt-1"
            style={{ color: "var(--color-ink-500)" }}
          >
            前一個工作日 16:00 整理（星期一於星期五） · 當日06:00補留更新 · 當日07:00 刊登 · 08:15 首次提醒 · 星期一 14:00／二至五
            15:45 再推送
          </p>
        </div>
        {!settingsOnly && (
          <button
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {open ? "收起管理" : "設定／手動補跑"}
          </button>
        )}
      </div>
      <p className="text-sm">
        自動流程：{config?.enabled ? "已啟用（須由外部排程器觸發）" : "未啟用"}
        　| Google來源：{ready.source ? "已配置" : "未配置"}　| 裝置推送：
        {ready.push ? "已配置" : "未配置"}　| 排程密鑰：
        {ready.scheduler ? "已配置" : "未配置"}
      </p>
      {open && (
        <>
          {!settingsOnly && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold">手動預覽及執行</h3>
              <p className="text-caption">
                從同一份來源重新讀取；相同日期更新原有公告及活動。推送仍依設定時間執行，已送出或結果不明的推送不重送。
                每日06:00把原表上一上課日未勾選出席者加入補留；成功後固定該輪補留名單。補留出席或再次缺席，請在原表新增補留當天的記錄，系統不會改寫原表。
              </p>
              <label className="block text-sm">
                日期（香港時間）
                <input
                  aria-label="課後班日期"
                  type="date"
                  value={date}
                  min={localDate()}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPreview(null);
                    
                  }}
                  className="border rounded p-2 ml-2"
                />
              </label>
              <div className="flex gap-3">
                <button
                  disabled={busy || !config}
                  onClick={() =>
                    void operation(async () => {
                      setPreview(null);
                      
                      setPreview(
                        await getJSON("/api/after-school/preview", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ date }),
                        }),
                      );
                    })
                  }
                  className="px-4 py-2 border rounded-lg disabled:opacity-50"
                >
                  預覽當日名單
                </button>
                <button
                  disabled={
                    busy ||
                    !preview ||
                    preview.date !== date ||
                    !!preview.errors.length ||
                    preview.skipped
                  }
                  onClick={() =>
                    void operation(async () => {
                      const r = await getJSON("/api/after-school/run", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          date,
                          expectedHash: preview!.hash,
                        }),
                      });
                      setMessage(
                        r.status === "EMPTY"
                          ? "當日沒有有效名單，沒有建立空公告或活動"
                          : r.unchanged
                            ? "來源未變，沒有重複建立"
                            : "公告及已批活動已更新，提醒按時間處理",
                      );
                      setPreview(null);
                      
                      await load();
                      await onPublished?.();
                    })
                  }
                  className="px-4 py-2 rounded-lg text-white bg-emerald-800 disabled:opacity-50"
                >
                  整理、刊登及建立已批活動
                </button>
              </div>
              {preview && (
                <div className="rounded bg-stone-50 p-4">
                  <h4 className="font-semibold">
                    {preview.title || preview.reason}
                  </h4>
                  <p className="text-xs mt-1">
                    有效配對：{preview.rows.length} 人；公告設定當日07:00刊登
                  </p>
                  {preview.errors.length > 0 && (
                    <ul className="text-red-700 text-sm list-disc pl-5">
                      {preview.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {!!preview.warnings?.length && (
                    <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">
                        活動時間重疊（已預設接受，課後班優先）
                      </p>
                      <ul className="list-disc pl-5">
                        {preview.warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>

                      <p className="text-xs mt-2">
                        系統會繼續整理及刊登，並按原定時間提醒；衝突內容保留於「活動／錯誤」，其他活動不會自動取消。
                      </p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm mt-3">
                    {preview.body}
                  </p>
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <form
              key={config?.version || 0}
              className="border rounded-lg p-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void operation(async () => {
                  await getJSON("/api/after-school/config", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      spreadsheetId: String(f.get("spreadsheetId")),
                      sheetTitle: String(f.get("sheetTitle")),
                      schoolYearStart: Number(f.get("year")),
                      enabled: f.get("enabled") === "on",
                      authorizeAutoApproval: f.get("authorization") === "on",
                      expectedVersion: config?.version || 0,
                    }),
                  });
                  setPreview(null);
                  
                  await load();
                  setMessage("來源及排程設定已儲存");
                });
              }}
            >
              <h3 className="font-semibold">來源及自動批核設定（管理員）</h3>
              <label className="block text-sm">
                Google Sheet 連結或檔案ID
                <input
                  required
                  name="spreadsheetId"
                  defaultValue={
                    config?.spreadsheetId
                      ? "https://drive.google.com/file/d/" +
                        config.spreadsheetId +
                        "/view"
                      : ""
                  }
                  className="block border rounded p-2 mt-1 w-full"
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                />
              </label>
              <p className="text-caption">
                支援完整Google試算表／Drive檔案連結。連結中的gid不會自動選取分頁，請填下方實際工作表名稱。
              </p>
              <p className="text-caption">
                轉新學年：先停用自動流程，分享新原檔的檢視權限，再更換連結、工作表名稱及年份（例如2027代表2027–28學年），到行政公告預覽後重新啟用。儲存後下一次整理即使用新來源，舊年度公告及活動保留。
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="text-sm">
                  工作表名稱
                  <input
                    required
                    name="sheetTitle"
                    defaultValue={config?.sheetTitle || "工作表1"}
                    className="block border rounded p-2 mt-1"
                  />
                </label>
                <label className="text-sm">
                  學年開始年份
                  <input
                    required
                    name="year"
                    type="number"
                    min={2020}
                    max={2100}
                    defaultValue={config?.schoolYearStart || 2026}
                    className="block border rounded p-2 mt-1"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={config?.enabled}
                />{" "}
                啟用每日自動流程
              </label>
              <label className="block text-sm">
                <input type="checkbox" name="authorization" required />{" "}
                我授權系統依已驗證的當日名單，以我的管理員身份自動批核課後班活動並向相關學生發送提醒。
              </label>
              <p className="text-caption">
                憑證及VAPID私鑰只在伺服器配置；請先為服務帳戶分享原檔只讀權限。此頁不修改原始試算表。
              </p>
              <button
                disabled={busy}
                className="border rounded-lg px-4 py-2 disabled:opacity-50"
              >
                儲存來源及排程設定
              </button>
            </form>
          )}
          {isAdmin && <AfterSchoolSetupGuide />}
          {!settingsOnly && (
            <div className="overflow-auto">
              <h3 className="font-semibold mb-2">最近30日處理紀錄</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">日期</th>
                    <th className="p-2">狀態</th>
                    <th className="p-2">裝置結果</th>
                    <th className="p-2">活動／錯誤</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const attempts = run.reminders.flatMap((r) => r.attempts);
                    const count = (s: string) =>
                      attempts.filter((a) => a.status === s).length;
                    return (
                      <tr key={run.date} className="border-t">
                        <td className="p-2">{run.date}</td>
                        <td className="p-2">{run.status}</td>
                        <td className="p-2">
                          接受 {count("ACCEPTED")}／失敗 {count("FAILED")}／不明{" "}
                          {count("UNKNOWN") + count("SENDING")}／無裝置提醒{" "}
                          {
                            run.reminders.filter(
                              (r) => r.status === "NO_DEVICE",
                            ).length
                          }
                          ／未配置{" "}
                          {
                            run.reminders.filter(
                              (r) => r.status === "NO_CONFIGURATION",
                            ).length
                          }
                        </td>
                        <td className="p-2">
                          {run.groups.map((g) => (
                            <a
                              key={g.activityId}
                              href={`/teacher/activities/${g.activityId}`}
                              className="underline mr-2"
                            >
                              {g.type === "TOOL_UP" ? "功課班" : "正向班"}
                            </a>
                          ))}
                          {run.lastError && (
                            <p
                              className={
                                run.status === "READY"
                                  ? "text-amber-800"
                                  : "text-red-700"
                              }
                            >
                              {run.lastError}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!runs.length && (
                <p className="text-caption p-2">
                  尚未執行；未有讀取資料不代表當日無名單。
                </p>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-700 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}


