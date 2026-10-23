"use client";
import { useRef } from "react";
import type { ReactNode, PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import type { GridItem, BoardSnapshot } from "@/lib/blackboard/types";
import { moveItem, resizeItem, gridDelta } from "@/lib/blackboard/grid";
import {
  NoteCard,
  HomeworkCard,
  MissingCard,
  TimetableCard,
} from "./BoardCard";
const colors = {
  amber: "bg-[#fff0bd]",
  blue: "bg-[#e2effb]",
  green: "bg-[#e2efdc]",
  rose: "bg-[#f9dfe1]",
  white: "bg-[#fffdf5]",
};
export function BoardGrid({
  snapshot,
  items,
  editable = false,
  onChange,
  now = new Date(),
  selectedDate,
}: {
  snapshot: BoardSnapshot;
  items: GridItem[];
  editable?: boolean;
  onChange?: (items: GridItem[]) => void;
  now?: Date;
  selectedDate?: string;
}) {
  const grid = useRef<HTMLDivElement>(null);
  function replace(index: number, item: GridItem) {
    onChange?.(items.map((v, i) => (i === index ? item : v)));
  }
  function start(
    e: PointerEvent<HTMLButtonElement>,
    index: number,
    resize = false,
  ) {
    if (!editable || !grid.current || window.innerWidth < 768) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const initial = items[index];
    const x = e.clientX,
      y = e.clientY;
    const unit = (grid.current.clientWidth + 16) / 12;
    const move = (v: globalThis.PointerEvent) => {
      const { dx, dy } = gridDelta(v.clientX - x, v.clientY - y, unit);
      replace(
        index,
        resize ? resizeItem(initial, dx, dy) : moveItem(initial, dx, dy),
      );
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  return (
    <div
      ref={grid}
      className="board-grid grid grid-cols-1 md:grid-cols-12 gap-4"
      style={{ gridAutoRows: "64px" }}
    >
      {items.map((item, index) => {
        const card = snapshot.cards.find((c) => c.id === item.id);
        let content: ReactNode;
        if (item.id === "homework")
          content = <HomeworkCard snapshot={snapshot} />;
        else if (item.id === "missing")
          content = <MissingCard snapshot={snapshot} />;
        else if (item.id === "timetable")
          content = (
            <TimetableCard
              snapshot={snapshot}
              now={now}
              selectedDate={selectedDate}
            />
          );
        else if (card)
          content = <NoteCard card={card} className={snapshot.className} />;
        else return null;
        return (
          <article
            key={item.id}
            className={`board-tile rounded-xl shadow-sm border border-black/5 p-5 text-[#283e35] flex flex-col min-w-0 ${card ? colors[card.color] : item.id === "missing" ? colors.rose : colors.white}`}
            style={{
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
            }}
          >
            {editable && (
              <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-black/10">
                <button
                  type="button"
                  aria-label="拖放或用方向鍵移動"
                  className="p-1 cursor-grab touch-none"
                  onPointerDown={(e) => start(e, index)}
                  onKeyDown={(e) => {
                    const directions: Record<string, [number, number]> = {
                      ArrowLeft: [-1, 0],
                      ArrowRight: [1, 0],
                      ArrowUp: [0, -1],
                      ArrowDown: [0, 1],
                    };
                    const d = directions[e.key];
                    if (d) {
                      e.preventDefault();
                      replace(index, moveItem(item, ...d));
                    }
                  }}
                >
                  <GripVertical size={16} />
                </button>
                {[
                  ["←", -1, 0],
                  ["→", 1, 0],
                  ["↑", 0, -1],
                  ["↓", 0, 1],
                ].map(([label, x, y]) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={`移動 ${label}`}
                    onClick={() =>
                      replace(index, moveItem(item, Number(x), Number(y)))
                    }
                    className="px-1.5 rounded bg-white/60 text-xs"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="px-1.5 text-xs bg-white/60 rounded"
                  onClick={() => replace(index, resizeItem(item, 1, 0))}
                >
                  加闊
                </button>
                <button
                  type="button"
                  className="px-1.5 text-xs bg-white/60 rounded"
                  onClick={() => replace(index, resizeItem(item, -1, 0))}
                >
                  收窄
                </button>
                <button
                  type="button"
                  className="px-1.5 text-xs bg-white/60 rounded"
                  onClick={() => replace(index, resizeItem(item, 0, 1))}
                >
                  加高
                </button>
                <button
                  type="button"
                  className="px-1.5 text-xs bg-white/60 rounded"
                  onClick={() => replace(index, resizeItem(item, 0, -1))}
                >
                  縮短
                </button>
                <button
                  type="button"
                  aria-label="拖放調整大小"
                  className="text-xs touch-none cursor-se-resize"
                  onPointerDown={(e) => start(e, index, true)}
                >
                  ↘
                </button>
                <button
                  type="button"
                  className="text-xs px-1"
                  onClick={() => {
                    const next = [...items];
                    if (index > 0) {
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      onChange?.(next);
                    }
                  }}
                >
                  提前
                </button>
              </div>
            )}
            <div className="overflow-auto min-h-0 flex-1">{content}</div>
          </article>
        );
      })}
      <style jsx>{`
        @media (max-width: 767px) {
          .board-grid {
            grid-auto-rows: auto !important;
          }
          .board-tile {
            grid-column: auto !important;
            grid-row: auto !important;
            min-height: 180px;
            max-height: 640px;
          }
        }
      `}</style>
    </div>
  );
}
