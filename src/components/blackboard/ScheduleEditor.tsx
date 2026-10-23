"use client";
import { useState } from "react";
import type { SchoolSlot } from "@/lib/blackboard/types";
import { DEFAULT_PERIODS } from "@/lib/school-periods";
import { writeBoard } from "./api";
export function ScheduleEditor({
  slots,
  version,
  onSaved,
}: {
  slots: SchoolSlot[];
  version: number;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(slots);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="border rounded-xl bg-white p-5">
      <h2 className="font-bold">全校課節時間（管理員）</h2>
      <p className="text-xs text-stone-500 mt-2 mb-3">
        同一設定供所有黑板使用。請確認實際上課時間；新增小息或午膳時，節次選「無」。
      </p>
      {!draft.length && (
        <button
          className="underline text-sm mb-3"
          onClick={() =>
            setDraft(
              DEFAULT_PERIODS.filter((s) => s.period).map((s) => ({
                id: crypto.randomUUID(),
                period: s.period,
                label: `第${s.period}節`,
                kind: "LESSON",
                startTime: s.startTime,
                endTime: s.endTime,
              })),
            )
          }
        >
          載入參考時間（儲存前請核對）
        </button>
      )}
      <div className="space-y-2">
        {draft.map((s, i) => (
          <div key={s.id} className="flex flex-wrap gap-2">
            <input
              aria-label="時段名稱"
              className="border rounded p-2 w-28"
              value={s.label}
              onChange={(e) =>
                setDraft(
                  draft.map((v, j) =>
                    i === j ? { ...v, label: e.target.value } : v,
                  ),
                )
              }
            />
            <select
              aria-label="時段類型"
              value={s.kind}
              className="border rounded p-2"
              onChange={(e) =>
                setDraft(
                  draft.map((v, j) =>
                    i === j
                      ? {
                          ...v,
                          kind: e.target.value as SchoolSlot["kind"],
                          period: e.target.value === "LESSON" ? v.period : null,
                        }
                      : v,
                  ),
                )
              }
            >
              <option value="LESSON">課堂</option>
              <option value="BREAK">小息</option>
              <option value="LUNCH">午膳</option>
            </select>
            <select
              aria-label="節次"
              value={s.period ?? ""}
              className="border rounded p-2"
              onChange={(e) =>
                setDraft(
                  draft.map((v, j) =>
                    i === j
                      ? {
                          ...v,
                          period: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }
                      : v,
                  ),
                )
              }
            >
              <option value="">無／具名時段</option>
              {Array.from({ length: 10 }, (_, n) => (
                <option key={n + 1} value={n + 1}>
                  {n + 1}
                </option>
              ))}
            </select>
            <input
              aria-label="開始時間"
              type="time"
              value={s.startTime}
              className="border rounded p-2"
              onChange={(e) =>
                setDraft(
                  draft.map((v, j) =>
                    i === j ? { ...v, startTime: e.target.value } : v,
                  ),
                )
              }
            />
            <input
              aria-label="結束時間"
              type="time"
              value={s.endTime}
              className="border rounded p-2"
              onChange={(e) =>
                setDraft(
                  draft.map((v, j) =>
                    i === j ? { ...v, endTime: e.target.value } : v,
                  ),
                )
              }
            />
            <button
              className="text-red-700 text-sm"
              onClick={() => setDraft(draft.filter((_, j) => j !== i))}
            >
              移除
            </button>
          </div>
        ))}
      </div>
      <button
        className="border px-3 py-2 rounded mt-3"
        onClick={() =>
          setDraft([
            ...draft,
            {
              id: crypto.randomUUID(),
              period: null,
              label: "小息",
              kind: "BREAK",
              startTime: "09:35",
              endTime: "09:50",
            },
          ])
        }
      >
        ＋ 加入時段
      </button>
      {error && (
        <p role="alert" className="text-red-700 text-sm mt-3">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="block bg-emerald-800 text-white px-4 py-2 rounded-lg mt-4 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await writeBoard("/api/teacher/blackboard/schedule", "PUT", {
              slots: draft,
              expectedVersion: version,
            });
            await onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "儲存失敗");
          } finally {
            setBusy(false);
          }
        }}
      >
        儲存全校課節
      </button>
    </section>
  );
}
