"use client";
import { useState } from "react";
import { writeBoard } from "./api";
type Preview = { classes: string[]; skipped: number; expectedHash: string };
export function BoardPasswordPreset() {
  const [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  async function operation(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card p-5 mt-6 space-y-3">
      <h2 className="text-h3">批量設定班級黑板密碼</h2>
      <p className="text-sm">
        密碼為keichi加小寫班別，例如1A → keichi1a、5A →
        keichi5a。只適用於班級黑板登入，不影響教師或學生個人帳戶。
      </p>
      <p className="text-sm">
        套用會重設以下班級的現有黑板密碼、啟用黑板並登出舊裝置。日後仍可在個別班級修改密碼；系統不會每次部署重設。
      </p>
      <button
        disabled={busy}
        className="border rounded-lg px-4 py-2 disabled:opacity-50"
        onClick={() =>
          void operation(async () => {
            setPreview(null);
            setConfirmed(false);
            const r = await fetch("/api/admin/blackboard/preset-passwords", {
              cache: "no-store",
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || "預覽失敗");
            setPreview(data);
          })
        }
      >
        預覽所有班級
      </button>
      {preview && (
        <>
          <p className="text-sm">
            將設定{preview.classes.length}班：
            {preview.classes.join("、") || "沒有班級"}；非標準班別／分組記錄略過
            {preview.skipped}項。
          </p>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            我確認重設以上班級黑板密碼、啟用黑板並登出舊裝置
          </label>
          <button
            disabled={busy || !confirmed || !preview.classes.length}
            className="rounded-lg px-4 py-2 bg-emerald-800 text-white disabled:opacity-50"
            onClick={() =>
              void operation(async () => {
                const result = await writeBoard(
                  "/api/admin/blackboard/preset-passwords",
                  "POST",
                  {
                    expectedHash: preview.expectedHash,
                    confirmation: "PRESET_ALL_BLACKBOARDS",
                  },
                );
                setPreview(null);
                setConfirmed(false);
                setMessage(
                  `已設定${result.updated}班，班級可到 /blackboard/login 登入`,
                );
              })
            }
          >
            {busy ? "處理中…" : "套用所有班級預設密碼"}
          </button>
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
