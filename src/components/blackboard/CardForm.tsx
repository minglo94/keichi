"use client";
import { useState } from "react";
import type { BoardCardInput, PublicCard } from "@/lib/blackboard/types";
import { cardInputSchema } from "@/lib/blackboard/validation";
const inputClass =
  "mt-1 w-full border border-stone-300 rounded-lg p-2 bg-white text-sm";
function localValue(v: string | null) {
  return v
    ? new Date(new Date(v).getTime() + 8 * 3600000).toISOString().slice(0, 16)
    : "";
}
export function CardForm({
  initial,
  subjects,
  isManager,
  classes,
  selectedClassId,
  initialTargets,
  onSave,
  onCancel,
}: {
  initial?: PublicCard;
  subjects: string[];
  isManager: boolean;
  classes: { id: string; name: string }[];
  selectedClassId: string;
  initialTargets?: string[];
  onSave: (input: BoardCardInput, targets: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState(initial?.type || "MEMO");
  const [targets, setTargets] = useState(initialTargets || [selectedClassId]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const payload =
    initial && (initial.type === "ACTIVITY" || initial.type === "DETENTION")
      ? initial.payload
      : null;
  return (
    <form
      className="bg-[#fffdf6] border rounded-xl p-5 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const text = (k: string) => String(f.get(k) || "");
        const input = {
          type,
          title: text("title"),
          body: text("body"),
          subject: text("subject") || null,
          color: text("color"),
          pinned: f.get("pinned") === "on",
          link: text("link") || null,
          startsAt: text("startsAt") ? `${text("startsAt")}:00+08:00` : null,
          endsAt: text("endsAt") ? `${text("endsAt")}:00+08:00` : null,
          payload:
            type === "ACTIVITY" || type === "DETENTION"
              ? {
                  date: text("date"),
                  startTime: text("startTime"),
                  endTime: text("endTime"),
                  location: text("location"),
                  ...(type === "DETENTION"
                    ? {
                        studentNumbers: text("numbers")
                          .split(/[,，、\s]+/)
                          .filter(Boolean),
                      }
                    : {}),
                }
              : {},
        };
        const p = cardInputSchema.safeParse(input);
        if (!p.success) {
          setError(p.error.issues[0]?.message || "請檢查內容");
          return;
        }
        setBusy(true);
        setError("");
        try {
          await onSave(p.data, targets);
        } catch (err) {
          setError(err instanceof Error ? err.message : "儲存失敗");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-bold text-lg">{initial ? "編輯便條" : "新增便條"}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          類型
          <select
            aria-label="類型"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className={inputClass}
          >
            <option value="MEMO">便條</option>
            <option value="ANNOUNCEMENT">公告</option>
            <option value="ACTIVITY">活動提醒</option>
            <option value="DETENTION">留堂安排</option>
          </select>
        </label>
        <label className="text-sm">
          科目
          {isManager ? (
            <input
              name="subject"
              defaultValue={initial?.subject || ""}
              placeholder="全班事項可留空"
              className={inputClass}
            />
          ) : (
            <select
              name="subject"
              required
              defaultValue={initial?.subject || subjects[0] || ""}
              className={inputClass}
            >
              <option value="">選擇科目</option>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </label>
      </div>
      <label className="block text-sm">
        標題
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={initial?.title}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        內容
        <textarea
          name="body"
          rows={4}
          maxLength={3000}
          defaultValue={initial?.body}
          className={inputClass}
        />
      </label>
      {(type === "DETENTION" || type === "ACTIVITY") && (
        <div className="grid sm:grid-cols-2 gap-3">
          {type === "DETENTION" && (
            <label className="text-sm sm:col-span-2">
              學號（以逗號分隔）
              <input
                name="numbers"
                required
                placeholder="08, 15"
                defaultValue={
                  initial?.type === "DETENTION"
                    ? initial.payload.studentNumbers.join(", ")
                    : ""
                }
                className={inputClass}
              />
            </label>
          )}
          <label className="text-sm">
            日期
            <input
              name="date"
              type="date"
              required
              defaultValue={payload?.date}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            地點
            <input
              name="location"
              required
              maxLength={120}
              defaultValue={payload?.location}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            開始時間
            <input
              name="startTime"
              type="time"
              required
              defaultValue={payload?.startTime}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            結束時間
            <input
              name="endTime"
              type="time"
              required
              defaultValue={payload?.endTime}
              className={inputClass}
            />
          </label>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          開始顯示（香港時間）
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={localValue(initial?.startsAt || null)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          停止顯示（香港時間）
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={localValue(initial?.endsAt || null)}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          便條顏色
          <select
            name="color"
            defaultValue={initial?.color || "amber"}
            className={inputClass}
          >
            <option value="amber">暖黃</option>
            <option value="blue">天空藍</option>
            <option value="green">草綠</option>
            <option value="rose">淡粉</option>
            <option value="white">米白</option>
          </select>
        </label>
        <label className="text-sm">
          詳情連結
          <input
            name="link"
            type="url"
            defaultValue={initial?.link || ""}
            placeholder="https://"
            className={inputClass}
          />
        </label>
      </div>
      <label className="block text-sm">
        <input type="checkbox" name="pinned" defaultChecked={initial?.pinned} />{" "}
        置頂
      </label>
      {classes.length > 1 && (
        <fieldset className="border rounded p-3">
          <legend className="text-sm">發布班別（管理員）</legend>
          <p className="text-xs text-stone-500 mb-2">
            多班便條由管理員統一管理；全選只包含目前班別。
          </p>
          <button
            type="button"
            onClick={() => setTargets(classes.map((c) => c.id))}
            className="text-xs underline mb-2"
          >
            選取全部
          </button>
          <div className="flex gap-3 flex-wrap">
            {classes.map((c) => (
              <label key={c.id} className="text-sm">
                <input
                  type="checkbox"
                  checked={targets.includes(c.id)}
                  disabled={c.id === selectedClassId}
                  onChange={(e) =>
                    setTargets(
                      e.target.checked
                        ? [...targets, c.id]
                        : targets.filter((id) => id !== c.id),
                    )
                  }
                />{" "}
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          disabled={busy}
          className="bg-emerald-800 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {busy ? "儲存中…" : "發布／儲存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded-lg"
        >
          取消
        </button>
      </div>
    </form>
  );
}
