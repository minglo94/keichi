"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { School, ArrowRight, LockKeyhole } from "lucide-react";
export default function BoardLogin() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <main className="min-h-screen bg-[#153f3b] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-emerald-200 flex items-center gap-2 mb-8 text-sm tracking-widest">
          <School size={20} /> KEICHI · CLASSROOM
        </div>
        <div className="bg-[#faf8ef] rounded-3xl p-8 shadow-2xl">
          <span className="text-emerald-700 text-xs font-semibold tracking-widest">
            OUR CLASS, TOGETHER
          </span>
          <h1 className="text-3xl font-bold text-[#173e38] mt-3">
            班級電子黑板
          </h1>
          <p className="text-stone-500 mt-3 mb-8">
            功課、活動、課堂與每一個小提醒，都在這裡。
          </p>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch("/api/blackboard/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    className: f.get("className"),
                    password: f.get("password"),
                  }),
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error);
                router.replace("/blackboard");
              } catch (err) {
                setError(err instanceof Error ? err.message : "登入失敗");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block text-sm font-medium text-stone-700">
              班別
              <input
                name="className"
                required
                maxLength={60}
                placeholder="例如 1A"
                autoComplete="username"
                className="mt-2 block w-full rounded-xl border border-stone-300 p-3 uppercase bg-white"
              />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              班級密碼
              <input
                name="password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                className="mt-2 block w-full rounded-xl border border-stone-300 p-3 bg-white"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-xl bg-[#216650] text-white p-3 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {busy ? "登入中…" : "進入班級黑板"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="mt-6 text-xs text-stone-500 flex gap-2 items-center">
            <LockKeyhole size={14} /> 班級帳戶只可查看本班資訊
          </p>
        </div>
      </div>
    </main>
  );
}
