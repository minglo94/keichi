"use client";
import { useEffect, useState } from "react";
import { Maximize, LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBoardSnapshot } from "./useBoardSnapshot";
import { BoardGrid } from "./BoardGrid";
import { defaultBoardItems } from "@/lib/blackboard/grid";
export default function BoardViewer() {
  const { snapshot, error, lastUpdated, retry } = useBoardSnapshot();
  const [now, setNow] = useState(new Date());
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
          <BoardGrid snapshot={snapshot} items={items} now={now} />
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
