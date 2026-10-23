"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardSnapshot } from "@/lib/blackboard/types";
export function useBoardSnapshot() {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const router = useRouter();
  const controller = useRef<AbortController>();
  const seq = useRef(0);
  const retry = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const n = ++seq.current;
    try {
      const r = await fetch("/api/blackboard", {
        cache: "no-store",
        signal: c.signal,
      });
      if (n !== seq.current) return;
      if (r.status === 401) {
        setSnapshot(null);
        router.replace("/blackboard/login");
        return;
      }
      if (!r.ok) throw new Error("更新失敗，以下為上次載入內容");
      const data = await r.json();
      if (n !== seq.current) return;
      setSnapshot(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      if (!c.signal.aborted && n === seq.current)
        setError(e instanceof Error ? e.message : "未能載入黑板");
    }
  }, [router]);
  useEffect(() => {
    void retry();
    const timer = setInterval(() => {
      if (!document.hidden) void retry();
    }, 30000);
    const visible = () => {
      if (!document.hidden) void retry();
      else {
        controller.current?.abort();
        seq.current++;
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retry]);
  return { snapshot, error, lastUpdated, retry };
}
