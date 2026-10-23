"use client";
import { useState } from "react";
import { writeBoard } from "./api";
export function BoardAccessSettings({
  classId,
  access,
  onSaved,
}: {
  classId: string;
  access: { enabled: boolean; version: number };
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="border rounded-xl bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const password = String(f.get("password") || "");
        setBusy(true);
        setError("");
        setMessage("");
        try {
          await writeBoard(
            `/api/teacher/classes/${classId}/blackboard/access`,
            "PUT",
            {
              enabled: f.get("enabled") === "on",
              expectedVersion: access.version,
              ...(password ? { password } : {}),
            },
          );
          await onSaved();
          setMessage("設定已更新，舊班級會話已撤銷");
        } catch (e) {
          setError(e instanceof Error ? e.message : "設定失敗");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-bold mb-3">班級登入設定</h2>
      <label className="block text-sm mb-3">
        <input name="enabled" type="checkbox" defaultChecked={access.enabled} />{" "}
        啟用班級黑板
      </label>
      <label className="block text-sm">
        {access.version ? "重設密碼（留空保留）" : "設定班級密碼"}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required={!access.version}
          className="block border rounded-lg p-2 w-full mt-1"
        />
      </label>
      <p className="text-xs text-stone-500 mt-2">
        密碼至少 8 個字元。每次儲存均會登出已登入的班級裝置。
      </p>
      {error && (
        <p role="alert" className="text-red-700 text-sm mt-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-700 text-sm mt-3">
          {message}
        </p>
      )}
      <button
        disabled={busy}
        className="bg-emerald-800 text-white px-4 py-2 rounded-lg mt-3 disabled:opacity-50"
      >
        儲存登入設定
      </button>
    </form>
  );
}
