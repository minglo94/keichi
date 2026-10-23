"use client";
import { useState } from "react";
import type { BoardSnapshot, TimetableRow } from "@/lib/blackboard/types";
import { writeBoard } from "./api";
export function TimetableEditor({
  classId,
  timetable,
  onSaved,
}: {
  classId: string;
  timetable: BoardSnapshot["timetable"];
  onSaved: () => Promise<void>;
}) {
  const [source, setSource] = useState(timetable.source);
  const [rows, setRows] = useState<TimetableRow[]>(timetable.rows);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="border bg-white p-5 rounded-xl">
      <h2 className="font-bold mb-3">星期一至五時間表</h2>
      <select
        aria-label="課表來源"
        value={source}
        onChange={(e) => setSource(e.target.value as typeof source)}
        className="border rounded p-2"
      >
        <option value="AUTO">使用已匯入時間表</option>
        <option value="MANUAL">手動維護本班課表</option>
      </select>
      {source === "MANUAL" && (
        <>
          <div className="space-y-2 mt-4">
            {rows.map((r, i) => (
              <div key={r.id} className="flex flex-wrap gap-2">
                <select
                  aria-label="星期"
                  value={r.day}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, day: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className="border p-2 rounded"
                >
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option value={d} key={d}>
                      星期{"一二三四五"[d - 1]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="節次"
                  value={r.period}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, period: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  className="border p-2 rounded"
                >
                  {Array.from({ length: 11 }, (_, n) => (
                    <option key={n} value={n}>
                      {n ? `第${n}節` : "具名時段"}
                    </option>
                  ))}
                </select>
                {r.period === 0 && (
                  <input
                    aria-label="時段名稱"
                    value={r.label || ""}
                    placeholder="早會"
                    onChange={(e) =>
                      setRows(
                        rows.map((x, j) =>
                          i === j ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    className="border p-2 rounded w-28"
                  />
                )}
                <input
                  aria-label="科目"
                  value={r.subject}
                  onChange={(e) =>
                    setRows(
                      rows.map((x, j) =>
                        j === i ? { ...x, subject: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="科目"
                  className="border p-2 rounded"
                />
                <button
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  className="text-red-700 text-sm"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <button
            className="border px-3 py-2 rounded mt-3"
            onClick={() =>
              setRows([
                ...rows,
                { id: crypto.randomUUID(), day: 1, period: 1, subject: "" },
              ])
            }
          >
            ＋ 加入課堂
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-red-700 mt-3 text-sm">
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
            await writeBoard(
              `/api/teacher/classes/${classId}/blackboard/timetable`,
              "PUT",
              { source, rows, expectedVersion: timetable.version },
            );
            await onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "儲存失敗");
          } finally {
            setBusy(false);
          }
        }}
      >
        儲存課表
      </button>
    </section>
  );
}
