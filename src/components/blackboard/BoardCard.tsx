"use client";
import { useState } from "react";
import { Pin, CalendarDays, BookOpen, Clock3 } from "lucide-react";
import type { BoardSnapshot, PublicCard } from "@/lib/blackboard/types";
import { getLessonState, slotForLesson } from "@/lib/blackboard/projection";
const labels = {
  MEMO: "班級便條",
  ANNOUNCEMENT: "公告",
  DETENTION: "留堂安排",
  ACTIVITY: "活動提醒",
};
export function NoteCard({
  card,
  className,
}: {
  card: PublicCard;
  className: string;
}) {
  return (
    <>
      <div className="flex justify-between items-center text-xs opacity-60 mb-3">
        <span>
          {labels[card.type]}
          {card.subject ? ` · ${card.subject}` : ""}
        </span>
        {card.pinned && <Pin size={15} />}
      </div>
      <h2 className="text-xl font-bold mb-3">{card.title}</h2>
      <p className="whitespace-pre-wrap break-words leading-relaxed text-sm">
        {card.body}
      </p>
      {(card.type === "DETENTION" || card.type === "ACTIVITY") && (
        <dl className="mt-4 space-y-2 text-sm">
          {card.type === "DETENTION" && (
            <div>
              <dt className="opacity-60 inline">班別／學號：</dt>
              <dd className="inline font-semibold">
                {className} ·{" "}
                {card.payload.studentNumbers.map((n) => `${n}號`).join("、")}
              </dd>
            </div>
          )}
          <div>
            <dt className="opacity-60 inline">日期：</dt>
            <dd className="inline">{card.payload.date}</dd>
          </div>
          <div>
            <dt className="opacity-60 inline">時間：</dt>
            <dd className="inline">
              {card.payload.startTime}–{card.payload.endTime}
            </dd>
          </div>
          <div>
            <dt className="opacity-60 inline">地點：</dt>
            <dd className="inline">{card.payload.location}</dd>
          </div>
        </dl>
      )}
      {card.link && (
        <a
          href={card.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4 underline text-sm"
        >
          查看詳情 ↗
        </a>
      )}
    </>
  );
}
export function HomeworkCard({ snapshot }: { snapshot: BoardSnapshot }) {
  return (
    <>
      <h2 className="font-bold text-lg flex gap-2 items-center mb-4">
        <BookOpen size={18} />
        功課一覽
      </h2>
      {!snapshot.homework.length ? (
        <p className="text-sm opacity-60">暫時沒有功課紀錄</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {snapshot.homework.map((h) => (
            <li key={h.id} className="py-3">
              <span className="text-xs text-emerald-700 font-semibold">
                {h.subject || "功課"}
              </span>
              <p className="font-medium mt-1">{h.title}</p>
              {h.detail && (
                <p className="text-sm opacity-70 whitespace-pre-wrap break-words mt-1">
                  {h.detail}
                </p>
              )}
              <p className="text-xs opacity-60 mt-1">
                {h.dueDate
                  ? `限期 ${new Date(h.dueDate).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}`
                  : "未設定限期"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
export function MissingCard({ snapshot }: { snapshot: BoardSnapshot }) {
  return (
    <>
      <h2 className="font-bold text-lg mb-1">待補交提醒</h2>
      <p className="text-xs opacity-60 mb-4">補交後由教師更新紀錄</p>
      {[false, true].map((absent) => (
        <section key={String(absent)} className="mb-4">
          <h3 className="text-sm font-semibold mb-2">
            {absent ? "缺席未交" : "欠交"}
          </h3>
          {snapshot.missing.filter((r) => r.absent === absent).length ? (
            <ul className="space-y-2">
              {snapshot.missing
                .filter((r) => r.absent === absent)
                .map((r, i) => (
                  <li key={i} className="text-sm rounded-lg bg-white/50 p-2">
                    <strong>
                      {r.number === "未設定" ? "學號未設定" : `${r.number}號`}
                    </strong>
                    <span className="ml-2">
                      {r.subject} · {r.homework}
                    </span>
                    <p className="text-xs opacity-60 mt-1">{r.date}</p>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm opacity-60">
              沒有{absent ? "缺席未交" : "欠交"}紀錄
            </p>
          )}
        </section>
      ))}
    </>
  );
}
export function TimetableCard({
  snapshot,
  now,
}: {
  snapshot: BoardSnapshot;
  now: Date;
}) {
  const [weekly, setWeekly] = useState(false);
  const t = snapshot.timetable;
  const state = getLessonState(t.rows, t.slots, now);
  const day = new Date(now.getTime() + 8 * 3600000).getUTCDay();
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
          {weekly ? "今日" : "全週"}
        </button>
      </div>
      <p className="text-sm mb-3 flex gap-2 items-center">
        <Clock3 size={14} />
        {state.status}
      </p>
      {t.warning && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded p-2 mb-3">
          {t.warning}
        </p>
      )}
      <div className="overflow-auto">
        <div
          className={
            weekly ? "grid grid-cols-5 min-w-[620px] gap-2" : "space-y-2"
          }
        >
          {days.map((d) => (
            <div key={d}>
              <h3 className="text-xs font-semibold opacity-60 mb-2">
                星期{"日一二三四五六"[d]}
              </h3>
              {t.rows
                .filter((r) => r.day === d)
                .sort((a, b) => a.period - b.period)
                .map((r) => {
                  const slot = slotForLesson(r, t.slots);
                  return (
                    <div
                      key={r.id}
                      className={`p-2 rounded-lg mb-2 text-sm ${state.currentIds.includes(r.id) ? "bg-emerald-700 text-white" : state.nextIds.includes(r.id) ? "bg-emerald-100" : "bg-stone-50"}`}
                    >
                      <div className="text-xs opacity-60">
                        {r.label || `第${r.period}節`}{" "}
                        {slot ? `${slot.startTime}–${slot.endTime}` : ""}
                      </div>
                      <strong>{r.subject}</strong>
                      {state.currentIds.includes(r.id) && (
                        <span className="block text-xs mt-1">● 正在上課</span>
                      )}
                      {state.nextIds.includes(r.id) && (
                        <span className="block text-xs mt-1">下一節</span>
                      )}
                    </div>
                  );
                })}
              {!t.rows.some((r) => r.day === d) && (
                <p className="text-xs opacity-60">沒有課堂</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
