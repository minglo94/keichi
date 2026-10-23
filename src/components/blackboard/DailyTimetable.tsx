"use client";
import { useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import type { BoardSnapshot } from "@/lib/blackboard/types";
import { getLessonState, slotForLesson } from "@/lib/blackboard/projection";
import { lessonCells } from "@/lib/blackboard/daily";
import { hkYmd, hkWeekday } from "@/lib/hk-date";
export function TimetableCard({
  snapshot,
  now,
  selectedDate,
}: {
  snapshot: BoardSnapshot;
  now: Date;
  selectedDate?: string;
}) {
  const [weekly, setWeekly] = useState(false);
  const date = selectedDate || hkYmd(now),
    day = hkWeekday(date),
    t = snapshot.timetable;
  const live = date === hkYmd(now);
  const state = live
    ? getLessonState(t.rows, t.slots, now)
    : { currentIds: [], nextIds: [], status: "所選日期課表" };
  const days = weekly ? [1, 2, 3, 4, 5] : [day];
  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-lg flex gap-2 items-center">
          <CalendarDays size={18} />
          班級時間表
        </h2>
        <button
          className="rounded-full border border-current px-3 py-1 text-xs"
          onClick={() => setWeekly(!weekly)}
        >
          {weekly ? "所選日期" : "全週"}
        </button>
      </div>
      <p className="text-sm mb-3 flex gap-2 items-center">
        <Clock3 size={14} />
        {date} · {state.status}
      </p>
      <p className="text-xs opacity-60 mb-3">
        每週恆常課表，假期／調課請以學校公告為準。分組為年級參考，請按實際選科及分組出席。
      </p>
      {t.warning && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded p-2 mb-3">
          {t.warning}
        </p>
      )}
      <div className="overflow-auto">
        <div
          className={
            weekly ? "grid grid-cols-5 min-w-[900px] gap-2" : "space-y-2"
          }
        >
          {days.map((d) => (
            <div key={d}>
              <h3 className="text-xs font-semibold opacity-60 mb-2">
                星期{"日一二三四五六"[d]}
              </h3>
              {lessonCells(t.rows, t.slots, d).map((cell) => {
                const current = cell.ids.some((id) =>
                  state.currentIds.includes(id),
                );
                const next = cell.ids.some((id) => state.nextIds.includes(id));
                return (
                  <div
                    key={cell.period}
                    data-period={cell.period}
                    className={`p-3 rounded-lg mb-2 text-sm ${current ? "bg-emerald-700 text-white" : next ? "bg-emerald-100" : "bg-stone-50"}`}
                  >
                    <div className="text-xs opacity-70 mb-1">
                      第{cell.period}節{" "}
                      {cell.slot
                        ? `${cell.slot.startTime}–${cell.slot.endTime}`
                        : ""}
                    </div>
                    <ul className="space-y-1">
                      {cell.lessons.map((r) => (
                        <li key={r.id} className="break-words">
                          <strong>{r.subject}</strong>
                          {r.groupCode && (
                            <span className="text-xs ml-2 opacity-80">
                              {r.groupLabel} · {r.groupCode}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {!cell.lessons.length && (
                      <p className="text-xs opacity-60">未設定</p>
                    )}
                    {(current || next) && (
                      <span className="block text-xs mt-1">
                        {current ? "● 正在上課" : "下一節"}
                      </span>
                    )}
                  </div>
                );
              })}
              {(d === 0 || d === 6) && (
                <p className="text-sm opacity-60">週末沒有恆常課堂</p>
              )}
              {t.rows
                .filter((r) => r.day === d && r.period === 0)
                .map((r) => {
                  const slot = slotForLesson(r, t.slots);
                  return (
                    <p
                      key={r.id}
                      className="text-sm p-2 rounded bg-stone-50 mb-2"
                    >
                      其他安排：{r.label}{" "}
                      {slot ? `${slot.startTime}–${slot.endTime}` : ""} ·{" "}
                      {r.subject} {r.groupCode}
                    </p>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
