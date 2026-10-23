"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  GridItem,
  TeacherBoard,
  PublicCard,
} from "@/lib/blackboard/types";
import {
  defaultBoardItems as mergeItems,
  rebaseLayoutDraft,
} from "@/lib/blackboard/grid";
import { BoardGrid } from "./BoardGrid";
import { CardForm } from "./CardForm";
import { TimetableEditor } from "./TimetableEditor";
import { ScheduleEditor } from "./ScheduleEditor";
import { BoardAccessSettings } from "./BoardAccessSettings";
import { writeBoard } from "./api";
export default function BoardEditor({ classId }: { classId: string }) {
  const [data, setData] = useState<TeacherBoard | null>(null);
  const [items, setItems] = useState<GridItem[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<PublicCard | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"board" | "cards" | "settings">("cards");
  const [dirty, setDirty] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const base = `/api/teacher/classes/${classId}/blackboard`;
  const load = useCallback(async () => {
    const r = await fetch(base, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error || "未能載入");
    setData(v);
    return v as TeacherBoard;
  }, [base]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (data && !dirty) {
      setItems(
        mergeItems(data.snapshot.layout.items, [
          "timetable",
          "homework",
          "missing",
          ...data.snapshot.cards.map((c) => c.id),
        ]),
      );
      setLayoutVersion(data.snapshot.layout.version);
    }
  }, [data, dirty]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  if (!data)
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold">班級黑板管理</h1>
        <p className="mt-4" role={error ? "alert" : undefined}>
          {error || "載入中…"}
        </p>
        <button
          className="mt-4 underline"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          重新載入
        </button>
      </main>
    );
  return (
    <main className="p-4 md:p-7 bg-[#f5f4ee] min-h-screen">
      <header className="flex flex-wrap justify-between gap-3 mb-5">
        <div>
          <Link
            href={`/teacher/classroom/${classId}`}
            className="text-sm text-emerald-800"
          >
            ← 返回課堂
          </Link>
          <h1 className="text-2xl font-bold text-emerald-950 mt-2">
            {data.snapshot.className} · 黑板管理
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {data.isManager
              ? "班主任／管理員"
              : "任教老師：只可管理自己科目的便條"}
          </p>
        </div>
        <a
          href="/blackboard/login"
          target="_blank"
          rel="noopener noreferrer"
          className="border bg-white px-4 py-2 rounded-lg h-fit text-sm"
        >
          開啟班級入口 ↗
        </a>
      </header>
      <nav className="flex gap-2 mb-5">
        {(
          [
            ["cards", "公告與便條"],
            ["board", "黑板排版"],
            ["settings", "時間表與登入"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm ${tab === t ? "bg-emerald-800 text-white" : "bg-white border"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="bg-red-50 text-red-700 p-3 rounded mb-4">
          {error}{" "}
          <button
            className="underline"
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            重新載入資料（保留版面草稿）
          </button>
        </p>
      )}
      {message && (
        <p
          role="status"
          className="bg-emerald-50 text-emerald-800 p-3 rounded mb-4"
        >
          {message}
        </p>
      )}
      {tab === "cards" && (
        <div className="grid xl:grid-cols-2 gap-5">
          <div>
            {editing !== undefined ? (
              <CardForm
                key={editing?.id || "new"}
                initial={editing || undefined}
                subjects={data.subjects}
                isManager={data.isManager}
                classes={data.classes}
                selectedClassId={classId}
                initialTargets={
                  editing
                    ? data.cards.find((c) => c.id === editing.id)
                        ?.targetClassIds
                    : undefined
                }
                onCancel={() => setEditing(undefined)}
                onSave={async (card, targets) => {
                  await writeBoard(
                    `${base}/cards${editing ? `/${editing.id}` : ""}`,
                    editing ? "PUT" : "POST",
                    {
                      card,
                      targetClassIds: targets,
                      ...(editing ? { expectedVersion: editing.version } : {}),
                    },
                  );
                  setEditing(undefined);
                  await load();
                  setMessage("便條已儲存");
                }}
              />
            ) : (
              <button
                className="bg-emerald-800 text-white px-5 py-3 rounded-xl"
                disabled={!data.isManager && !data.subjects.length}
                onClick={() => {
                  setMessage("");
                  setEditing(null);
                }}
              >
                ＋ 新增公告／便條
              </button>
            )}
            {!data.isManager && !data.subjects.length && (
              <p className="text-sm text-amber-800 mt-3">
                尚未找到你的任教科目，請交由班主任發布或先設定時間表。
              </p>
            )}
            <p className="text-sm text-stone-500 mt-4">
              現有教師公告及活動不會自動公開。請明確選取適合全班閱讀的內容，在這裡發布。
            </p>
          </div>
          <div className="space-y-3">
            {data.cards.map((c) => {
              const canEdit =
                (data.isManager || c.authorId === data.userId) &&
                (data.isAdmin || c.targetClassIds.length === 1);
              return (
                <article key={c.id} className="bg-white p-4 rounded-xl border">
                  <div className="flex justify-between gap-2">
                    <h2 className="font-semibold">{c.title}</h2>
                    <span className="text-xs text-stone-500">
                      {c.archivedAt
                        ? "已封存"
                        : c.endsAt && new Date(c.endsAt) <= new Date()
                          ? "已到期"
                          : c.startsAt && new Date(c.startsAt) > new Date()
                            ? "待發布"
                            : "已發布"}
                    </span>
                  </div>
                  <p className="text-sm text-stone-600 mt-2 whitespace-pre-wrap line-clamp-3">
                    {c.body}
                  </p>
                  {canEdit && !c.archivedAt && (
                    <div className="flex gap-4 text-sm mt-3">
                      <button
                        className="text-emerald-700 underline"
                        onClick={() => setEditing(c)}
                      >
                        編輯
                      </button>
                      <button
                        disabled={busy}
                        className="text-stone-500 underline disabled:opacity-50"
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await writeBoard(
                              `${base}/cards/${c.id}`,
                              "DELETE",
                              { expectedVersion: c.version },
                            );
                            await load();
                            setMessage("便條已封存");
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "封存失敗",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        封存
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
            {!data.cards.length && (
              <p className="text-stone-500 p-5">
                還沒有便條，建立第一則班級提醒吧。
              </p>
            )}
          </div>
        </div>
      )}
      {tab === "board" && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <p className="text-sm text-stone-600">
              拖動把手或按方向鍵調整位置；手機可用「提前」調整次序。
              {dirty ? "有未儲存變更。" : ""}
            </p>
            {data.isManager && (
              <>
                {dirty && layoutVersion !== data.snapshot.layout.version && (
                  <button
                    type="button"
                    className="border border-amber-500 bg-amber-50 px-3 py-2 rounded text-sm"
                    onClick={() => {
                      const next = rebaseLayoutDraft(
                        items,
                        data.snapshot.layout.version,
                      );
                      setItems(next.items);
                      setLayoutVersion(next.version);
                      setMessage("已保留草稿並採用最新版本，請檢閱後再儲存");
                    }}
                  >
                    檢閱後採用最新版本（保留草稿）
                  </button>
                )}

                <button
                  disabled={busy || !dirty}
                  className="bg-emerald-800 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                  onClick={async () => {
                    setBusy(true);
                    setMessage("");
                    setError("");
                    try {
                      await writeBoard(`${base}/layout`, "PUT", {
                        items,
                        expectedVersion: layoutVersion,
                      });
                      setDirty(false);
                      await load();
                      setMessage("全班共用版面已儲存");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "儲存失敗");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  儲存共用版面
                </button>
                <button
                  className="underline text-sm"
                  onClick={() => {
                    setDirty(false);
                    setItems(
                      mergeItems(data.snapshot.layout.items, [
                        "timetable",
                        "homework",
                        "missing",
                        ...data.snapshot.cards.map((c) => c.id),
                      ]),
                    );
                    setLayoutVersion(data.snapshot.layout.version);
                  }}
                >
                  放棄版面草稿
                </button>
              </>
            )}
          </div>
          <BoardGrid
            snapshot={data.snapshot}
            items={items}
            editable={data.isManager}
            onChange={(v) => {
              setItems(v);
              setDirty(true);
            }}
          />
        </>
      )}
      {tab === "settings" &&
        (data.isManager ? (
          <div className="space-y-5">
            <BoardAccessSettings
              key={`access-${data.access.version}`}
              classId={classId}
              access={data.access}
              onSaved={async () => {
                await load();
                setMessage("設定已更新，舊班級會話已撤銷");
              }}
            />
            <TimetableEditor
              key={`table-${data.snapshot.timetable.version}`}
              classId={classId}
              timetable={data.snapshot.timetable}
              onSaved={async () => {
                await load();
              }}
            />
            {data.isAdmin && (
              <ScheduleEditor
                key={`schedule-${data.scheduleVersion}`}
                slots={data.snapshot.timetable.slots}
                version={data.scheduleVersion}
                onSaved={async () => {
                  await load();
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            時間表、登入及全班排版由班主任或管理員設定。
          </p>
        ))}
    </main>
  );
}
