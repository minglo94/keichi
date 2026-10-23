"use client";
import { useEffect, useState } from "react";
import { Maximize, LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBoardSnapshot } from "./useBoardSnapshot";
import { BoardGrid } from "./BoardGrid";
import { DayActivities } from "./DayActivities";
import { hkYmd } from "@/lib/hk-date";
import { shiftDate } from "@/lib/blackboard/daily";
import { defaultBoardItems } from "@/lib/blackboard/grid";
export default function BoardViewer() {
  const { snapshot, error, lastUpdated, retry } = useBoardSnapshot();
  const [now, setNow] = useState(new Date());
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const selectedDate = chosenDate || hkYmd(now);
  const [actionError, setActionError] = useState("");
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  const items = snapshot
    ? defaultBoardItems(snapshot.layout.items, [
        "timetable",
        "homework",
        "missing",
        ...snapshot.cards.map((c) => c.id),
      ])
    : [];
  return (
    <main className="min-h-screen bg-[#17443c] p-4 md:p-8">
      <header className="flex flex-wrap justify-between items-start gap-4 text-[#f5f1db] max-w-[1800px] mx-auto mb-7">
        <div>
          <p className="text-xs tracking-[.25em] text-emerald-200 mb-2">
            KEICHI · OUR CLASSROOM
          </p>
          <h1 className="text-3xl md:text-4xl font-bold">
            {snapshot?.className || "班級"}{" "}
            <span className="font-normal opacity-80">電子黑板</span>
          </h1>
          <p className="text-sm text-emerald-100/70 mt-2">
            {now.toLocaleDateString("zh-HK", {
              timeZone: "Asia/Hong_Kong",
              dateStyle: "full",
            })}{" "}
            ·{" "}
            {now.toLocaleTimeString("zh-HK", {
              timeZone: "Asia/Hong_Kong",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            title="重新整理"
            aria-label="重新整理"
            onClick={() => void retry()}
            className="p-2 rounded-lg bg-white/10"
          >
            <RefreshCw size={18} />
          </button>
          <button
            title="全螢幕"
            aria-label="全螢幕"
            onClick={() =>
              void (
                document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen()
              ).catch(() => setActionError("此裝置未支援全螢幕"))
            }
            className="p-2 rounded-lg bg-white/10"
          >
            <Maximize size={18} />
          </button>
          <button
            onClick={async () => {
              try {
                const r = await fetch("/api/blackboard/logout", {
                  method: "POST",
                });
                if (!r.ok) throw new Error();
                router.replace("/blackboard/login");
              } catch {
                setActionError("登出失敗，請重試");
              }
            }}
            className="flex items-center gap-2 p-2 rounded-lg bg-white/10 text-sm"
          >
            <LogOut size={17} />
            登出
          </button>
        </div>
      </header>
      <nav
        aria-label="查看日期"
        className="max-w-[1800px] mx-auto mb-5 flex flex-wrap items-center gap-3 text-[#f5f1db]"
      >
        <button
          disabled={selectedDate <= "2000-01-01"}
          className="rounded border border-white/30 px-3 py-2 disabled:opacity-40"
          onClick={() => setChosenDate(shiftDate(selectedDate, -1))}
        >
          前一天
        </button>
        <label className="flex items-center gap-2">
          查看日期
          <input
            aria-label="查看日期"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.validity.valid && e.target.value)
                setChosenDate(e.target.value);
            }}
            className="rounded px-3 py-2 text-stone-900"
          />
        </label>
        <button
          disabled={selectedDate >= "2100-12-31"}
          className="rounded border border-white/30 px-3 py-2 disabled:opacity-40"
          onClick={() => setChosenDate(shiftDate(selectedDate, 1))}
        >
          後一天
        </button>
        <button
          className="rounded bg-white/15 px-3 py-2"
          onClick={() => setChosenDate(null)}
        >
          今日
        </button>
      </nav>
      {(error || actionError) && (
        <div
          role="alert"
          className="bg-amber-100 text-amber-900 p-3 rounded-lg mb-4"
        >
          {error || actionError}
          <button onClick={() => void retry()} className="ml-3 underline">
            重試
          </button>
        </div>
      )}
      <div className="max-w-[1800px] mx-auto">
        {snapshot ? (
          <>
            <DayActivities date={selectedDate} className={snapshot.className} />
            <BoardGrid
              snapshot={snapshot}
              items={items}
              now={now}
              selectedDate={selectedDate}
            />
          </>
        ) : (
          <p className="text-white/80 p-8">
            {error ? "未能載入班級資訊" : "正在準備班級黑板…"}
          </p>
        )}
      </div>
      <footer className="text-xs text-emerald-100/60 mt-6 text-right">
        {lastUpdated
          ? `最後更新 ${lastUpdated.toLocaleTimeString("zh-HK", { timeZone: "Asia/Hong_Kong" })} · 每 30 秒更新`
          : "等待連線"}
      </footer>
    </main>
  );
}
