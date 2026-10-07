// 座位表 — pure layout logic, no database, so the board, the API and the Excel
// export all work from one definition.
//
// A layout is a rows × cols grid stored row-major. A cell is a seat (possibly
// empty), a blank (aisle / no desk), or a text label (門, 窗). 分組 lives on the
// *seat*, not the student: groups are where people sit, so moving a student to
// another table moves them into that table's group — which is what a teacher
// rearranging the room means.

export type SeatCell =
  | { kind: "seat"; studentId: string | null; group?: string }
  | { kind: "blank" }
  | { kind: "label"; text: string }

export type SeatGroup = { id: string; name: string; color: string }

export type SeatingLayout = {
  version: 1
  rows: number
  cols: number
  cells: SeatCell[]
  groups: SeatGroup[]
  /** 講台 drawn above the grid (true) or below it (false). Export mirrors the screen. */
  frontAtTop: boolean
}

export const MIN_DIM = 1
export const MAX_ROWS = 12
export const MAX_COLS = 12

// Pale fills that read on screen and print in Excel. Hex without '#', so the
// export can prefix "FF" for ARGB and the board can prefix "#".
export const GROUP_COLORS = [
  "FDE68A", "BFDBFE", "BBF7D0", "FBCFE8", "DDD6FE",
  "FED7AA", "A5F3FC", "FECACA", "D9F99D", "E5E7EB",
]

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)))

export function emptyLayout(rows = 6, cols = 7): SeatingLayout {
  rows = clamp(rows, MIN_DIM, MAX_ROWS)
  cols = clamp(cols, MIN_DIM, MAX_COLS)
  return {
    version: 1, rows, cols,
    cells: Array.from({ length: rows * cols }, () => ({ kind: "seat", studentId: null })),
    groups: [],
    frontAtTop: true,
  }
}

/**
 * Coerce whatever came out of a Json column into a valid layout. Never throws:
 * a malformed blob degrades to an empty grid of the stated size rather than
 * taking the page down.
 */
export function parseLayout(raw: unknown): SeatingLayout {
  if (!raw || typeof raw !== "object") return emptyLayout()
  const r = raw as Partial<SeatingLayout>
  const base = emptyLayout(Number(r.rows) || 6, Number(r.cols) || 7)
  const cells = Array.isArray(r.cells) ? r.cells : []
  base.cells = base.cells.map((fallback, i) => {
    const c = cells[i] as SeatCell | undefined
    if (!c || typeof c !== "object") return fallback
    if (c.kind === "blank") return { kind: "blank" }
    if (c.kind === "label") return { kind: "label", text: String((c as { text?: unknown }).text ?? "").slice(0, 8) }
    if (c.kind === "seat") {
      const sid = typeof c.studentId === "string" ? c.studentId : null
      const g   = typeof c.group === "string" ? c.group : undefined
      return g ? { kind: "seat", studentId: sid, group: g } : { kind: "seat", studentId: sid }
    }
    return fallback
  })
  base.groups = Array.isArray(r.groups)
    ? r.groups
        .filter((g): g is SeatGroup => !!g && typeof g.id === "string")
        .map((g) => ({ id: g.id, name: String(g.name ?? g.id).slice(0, 20), color: String(g.color ?? GROUP_COLORS[0]) }))
    : []
  base.frontAtTop = r.frontAtTop !== false
  return dropUnusedGroupRefs(base)
}

/** Cell index → [row, col]. */
export const rcOf = (l: SeatingLayout, i: number): [number, number] => [Math.floor(i / l.cols), i % l.cols]

/** Change grid size, keeping every cell that still fits at the same row/col. */
export function resize(l: SeatingLayout, rows: number, cols: number): SeatingLayout {
  const next = emptyLayout(rows, cols)
  for (let r = 0; r < Math.min(l.rows, next.rows); r++) {
    for (let c = 0; c < Math.min(l.cols, next.cols); c++) {
      next.cells[r * next.cols + c] = l.cells[r * l.cols + c]
    }
  }
  return { ...next, groups: l.groups, frontAtTop: l.frontAtTop }
}

export function seatedIds(l: SeatingLayout): Set<string> {
  const s = new Set<string>()
  for (const c of l.cells) if (c.kind === "seat" && c.studentId) s.add(c.studentId)
  return s
}

export function indexOfStudent(l: SeatingLayout, studentId: string): number {
  return l.cells.findIndex((c) => c.kind === "seat" && c.studentId === studentId)
}

/**
 * Swap two cells. Seat ↔ seat swaps only the occupants, so each seat keeps its
 * group (the group is the table, not the person). Anything involving a blank
 * or label swaps the whole cell — that's moving furniture.
 */
export function swapCells(l: SeatingLayout, a: number, b: number): SeatingLayout {
  if (a === b || a < 0 || b < 0 || a >= l.cells.length || b >= l.cells.length) return l
  const cells = l.cells.slice()
  const ca = cells[a], cb = cells[b]
  if (ca.kind === "seat" && cb.kind === "seat") {
    cells[a] = { ...ca, studentId: cb.studentId }
    cells[b] = { ...cb, studentId: ca.studentId }
  } else {
    cells[a] = cb
    cells[b] = ca
  }
  return { ...l, cells }
}

/**
 * Put a student (typically from the 未入座 tray) into a cell. If the cell is
 * occupied, the occupant is bumped back to the tray; if the student was
 * already seated elsewhere, that seat empties. A non-seat cell becomes a seat.
 */
export function placeStudent(l: SeatingLayout, index: number, studentId: string): SeatingLayout {
  if (index < 0 || index >= l.cells.length) return l
  const cells = l.cells.map((c) =>
    c.kind === "seat" && c.studentId === studentId ? { ...c, studentId: null } : c)
  const target = cells[index]
  cells[index] = target.kind === "seat"
    ? { ...target, studentId }
    : { kind: "seat", studentId }
  return { ...l, cells }
}

export function unseat(l: SeatingLayout, index: number): SeatingLayout {
  const c = l.cells[index]
  if (!c || c.kind !== "seat" || !c.studentId) return l
  const cells = l.cells.slice()
  cells[index] = { ...c, studentId: null }
  return { ...l, cells }
}

/** Cycle an EMPTY cell: seat → 走廊 (blank) → 門 → seat. Occupied seats are left alone. */
export function cycleCellKind(l: SeatingLayout, index: number): SeatingLayout {
  const c = l.cells[index]
  if (!c) return l
  if (c.kind === "seat" && c.studentId) return l
  const cells = l.cells.slice()
  cells[index] =
    c.kind === "seat"  ? { kind: "blank" } :
    c.kind === "blank" ? { kind: "label", text: "門" } :
                         { kind: "seat", studentId: null }
  return dropUnusedGroupRefs({ ...l, cells })
}

/** Seat indices in reading order from the 講台 outward. */
export function seatOrder(l: SeatingLayout): number[] {
  const rows = Array.from({ length: l.rows }, (_, r) => r)
  if (!l.frontAtTop) rows.reverse()
  const out: number[] = []
  for (const r of rows) for (let c = 0; c < l.cols; c++) {
    const i = r * l.cols + c
    if (l.cells[i].kind === "seat") out.push(i)
  }
  return out
}

const numOrder = (n: string | null) => {
  const v = parseInt(n ?? "", 10)
  return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER
}

/**
 * 自動排座（按學號）: clear every seat and fill them front-first in class-number
 * order. Students who don't fit stay in the tray; the caller reports how many.
 */
export function autoSeatByNumber(
  l: SeatingLayout,
  roster: { id: string; classNumber: string | null; name?: string | null }[],
): { layout: SeatingLayout; unseated: number } {
  const sorted = roster.slice().sort((a, b) =>
    numOrder(a.classNumber) - numOrder(b.classNumber) || (a.name ?? "").localeCompare(b.name ?? ""))
  const cells: SeatCell[] = l.cells.map((c) => (c.kind === "seat" ? { ...c, studentId: null } : c))
  const order = seatOrder(l)
  order.forEach((idx, k) => {
    const c = cells[idx]
    if (c.kind === "seat" && sorted[k]) cells[idx] = { ...c, studentId: sorted[k].id }
  })
  return { layout: { ...l, cells }, unseated: Math.max(0, sorted.length - order.length) }
}

/**
 * Drop students who are no longer on the roster. Their seats empty rather than
 * the chart closing up — a leaver must not silently reshuffle everyone else.
 */
export function reconcile(l: SeatingLayout, rosterIds: Set<string>): { layout: SeatingLayout; dropped: string[] } {
  const dropped: string[] = []
  const cells = l.cells.map((c) => {
    if (c.kind === "seat" && c.studentId && !rosterIds.has(c.studentId)) {
      dropped.push(c.studentId)
      return { ...c, studentId: null }
    }
    return c
  })
  return { layout: dropped.length ? { ...l, cells } : l, dropped }
}

function makeGroups(n: number, existing: SeatGroup[] = []): SeatGroup[] {
  return Array.from({ length: n }, (_, i) => existing[i] ?? ({
    id: `g${i + 1}`, name: `第${i + 1}組`, color: GROUP_COLORS[i % GROUP_COLORS.length],
  }))
}

/** Remove group ids no seat uses any more, and seat refs to groups that don't exist. */
export function dropUnusedGroupRefs(l: SeatingLayout): SeatingLayout {
  const known = new Set(l.groups.map((g) => g.id))
  const cells = l.cells.map((c) =>
    c.kind === "seat" && c.group && !known.has(c.group) ? { kind: "seat" as const, studentId: c.studentId } : c)
  return { ...l, cells }
}

export function clearGroups(l: SeatingLayout): SeatingLayout {
  return {
    ...l,
    groups: [],
    cells: l.cells.map((c) => (c.kind === "seat" ? { kind: "seat", studentId: c.studentId } : c)),
  }
}

/** Toggle one seat in or out of a group (分組 mode tap). */
export function toggleSeatGroup(l: SeatingLayout, index: number, groupId: string): SeatingLayout {
  const c = l.cells[index]
  if (!c || c.kind !== "seat") return l
  const cells = l.cells.slice()
  cells[index] = c.group === groupId
    ? { kind: "seat", studentId: c.studentId }
    : { ...c, group: groupId }
  return { ...l, cells }
}

export function addGroup(l: SeatingLayout): { layout: SeatingLayout; group: SeatGroup } {
  let n = l.groups.length + 1
  while (l.groups.some((g) => g.id === `g${n}`)) n++
  const group = { id: `g${n}`, name: `第${n}組`, color: GROUP_COLORS[(n - 1) % GROUP_COLORS.length] }
  return { layout: { ...l, groups: [...l.groups, group] }, group }
}

/**
 * 分組器: split the *occupied* seats into n groups. Random by default (the
 * classroom tool), or in seating order (`shuffle: false`) so neighbours group
 * together. Empty seats are left ungrouped.
 */
export function autoGroup(l: SeatingLayout, n: number, opts: { shuffle?: boolean; random?: () => number } = {}): SeatingLayout {
  const occupied = seatOrder(l).filter((i) => {
    const c = l.cells[i]
    return c.kind === "seat" && !!c.studentId
  })
  n = clamp(n, 1, Math.max(1, Math.min(occupied.length, GROUP_COLORS.length)))
  if (opts.shuffle !== false) {
    const rnd = opts.random ?? Math.random
    for (let i = occupied.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [occupied[i], occupied[j]] = [occupied[j], occupied[i]]
    }
  }
  const groups = makeGroups(n)
  const base = clearGroups(l)
  const cells = base.cells.slice()
  // Round-robin, so sizes differ by at most one.
  occupied.forEach((idx, k) => {
    const c = cells[idx]
    if (c.kind === "seat") cells[idx] = { ...c, group: groups[k % n].id }
  })
  return { ...base, cells, groups }
}

/** 依座位分組: every w×h block of the room is one group (e.g. 2×2 tables). */
export function groupByBlock(l: SeatingLayout, w = 2, h = 2): SeatingLayout {
  w = clamp(w, 1, l.cols); h = clamp(h, 1, l.rows)
  const base = clearGroups(l)
  const cells = base.cells.slice()
  const used = new Map<string, number>() // block key → group number
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.kind !== "seat") continue
    const [r, col] = rcOf(l, i)
    const key = `${Math.floor(r / h)}-${Math.floor(col / w)}`
    if (!used.has(key)) used.set(key, used.size)
    cells[i] = { ...c, group: `g${used.get(key)! + 1}` }
  }
  return { ...base, cells, groups: makeGroups(Math.min(used.size, 99)) }
}

/** Students per group, in group order — for the legend and the scoreboard. */
export function groupMembers(l: SeatingLayout): Map<string, string[]> {
  const m = new Map<string, string[]>(l.groups.map((g) => [g.id, []]))
  for (const i of seatOrder(l)) {
    const c = l.cells[i]
    if (c.kind === "seat" && c.group && c.studentId) m.get(c.group)?.push(c.studentId)
  }
  return m
}

/**
 * Apply externally-made groups (分組器) to the chart: each student's seat takes
 * their group. Students not currently seated can't carry a group on the chart
 * and are returned so the caller can say so.
 */
export function applyGroups(l: SeatingLayout, groups: string[][]): { layout: SeatingLayout; unseated: string[] } {
  const defs = makeGroups(Math.min(groups.length, 99))
  const base = clearGroups(l)
  const cells = base.cells.slice()
  const unseated: string[] = []
  groups.forEach((members, gi) => {
    for (const id of members) {
      const idx = indexOfStudent(base, id)
      const c = cells[idx]
      if (idx < 0 || !c || c.kind !== "seat") { unseated.push(id); continue }
      cells[idx] = { ...c, group: defs[gi].id }
    }
  })
  return { layout: { ...base, cells, groups: defs }, unseated }
}

/** Split ids into n random groups (sizes differ by at most one). */
export function randomGroups(ids: string[], n: number, random: () => number = Math.random): string[][] {
  const pool = ids.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  n = Math.max(1, Math.min(n, pool.length || 1))
  const out: string[][] = Array.from({ length: n }, () => [])
  pool.forEach((id, k) => out[k % n].push(id))
  return out
}
