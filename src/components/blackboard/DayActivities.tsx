"use client";
import { useEffect, useState } from "react";
import type { ClassDayActivity } from "@/lib/blackboard/daily-activities";
import { hkHm, hkYmd } from "@/lib/hk-date";
type Result = { date: string; activities: ClassDayActivity[] };
export function DayActivities({
  date,
  className,
}: {
  date: string;
  className: string;
}) {
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult(null);
    setError("");
    async function refresh() {
      try {
        const response = await fetch(
          `/api/blackboard/day?date=${encodeURIComponent(date)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("未能讀取當日活動，請重試");
        const data: Result = await response.json();
        if (active && data.date === date) {
          setResult(data);
          setError("");
        }
      } catch (e) {
        if (active && !controller.signal.aborted) {
          setResult(null);
          setError(e instanceof Error ? e.message : "讀取失敗");
        }
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [date, retry]);
  const data = result?.date === date ? result : null;
  const time = (value: string) =>
    `${hkYmd(new Date(value))} ${hkHm(new Date(value))}`;
  return (
    <section
      className="rounded-xl bg-[#fffdf5] p-5 mb-5 text-[#283e35]"
      aria-label="當日活動及課後班"
      aria-busy={!data && !error}
    >
      <h2 className="font-bold text-lg mb-3">
        {date} · {className} 活動／課後班
      </h2>
      {error ? (
        <p role="alert">
          {error}
          <button
            className="underline ml-3"
            onClick={() => setRetry((n) => n + 1)}
          >
            重試
          </button>
        </p>
      ) : !data ? (
        <p role="status">正在載入當日活動…</p>
      ) : !data.activities.length ? (
        <p className="text-sm opacity-70">當日沒有已安排的公開活動／課後班。</p>
      ) : (
        <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.activities.map((a) => (
            <li key={a.id} className="rounded-lg bg-stone-50 p-3">
              <p className="text-xs opacity-60">
                {a.kind === "AFTER_SCHOOL" ? "課後班" : "活動"}
              </p>
              <h3 className="font-bold">{a.title}</h3>
              <p className="text-sm mt-1">
                {time(a.startTime)}
                {a.endTime ? `–${time(a.endTime)}` : "（結束時間未設定）"}
              </p>
              <p className="text-sm">地點：{a.location || "未設定"}</p>
              <p className="text-sm mt-2">
                {a.studentNumbers.length
                  ? `${className} #${a.studentNumbers.join("、")}`
                  : ""}
                {a.unnumberedCount
                  ? ` ${a.unnumberedCount}位同學學號未設定`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
