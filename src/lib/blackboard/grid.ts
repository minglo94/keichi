import type { GridItem } from "./types";
export function moveItem(item: GridItem, dx: number, dy: number): GridItem {
  return {
    ...item,
    x: Math.max(0, Math.min(12 - item.w, item.x + dx)),
    y: Math.max(0, Math.min(200, item.y + dy)),
  };
}
export function resizeItem(item: GridItem, dw: number, dh: number): GridItem {
  return {
    ...item,
    w: Math.max(2, Math.min(12 - item.x, item.w + dw)),
    h: Math.max(2, Math.min(12, item.h + dh)),
  };
}
export function mergeItems(saved: GridItem[], ids: string[]): GridItem[] {
  const result = saved.filter((i) => ids.includes(i.id));
  for (const id of ids)
    if (!result.some((i) => i.id === id)) {
      const y = Math.max(0, ...result.map((i) => i.y + i.h));
      result.push({
        id,
        x: 0,
        y: Math.min(200, y),
        w: id === "timetable" ? 8 : 4,
        h: id === "timetable" ? 6 : 4,
      });
    }
  return result;
}

export function rebaseLayoutDraft(items: GridItem[], version: number) {
  return { items: [...items], version };
}
export function defaultBoardItems(saved: GridItem[], ids: string[]) {
  return mergeItems(
    saved.length
      ? saved
      : [
          { id: "timetable", x: 0, y: 0, w: 8, h: 6 },
          { id: "homework", x: 8, y: 0, w: 4, h: 6 },
          { id: "missing", x: 0, y: 6, w: 4, h: 5 },
        ],
    ids,
  );
}
export function gridDelta(dx: number, dy: number, columnWidth: number) {
  return { dx: Math.round(dx / columnWidth), dy: Math.round(dy / 80) };
}
