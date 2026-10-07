"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as S from "@/lib/seating"
import type { SeatingLayout } from "@/lib/seating"

// 座位表 board.
//
// Tap-to-select then tap-to-place is the contract: it works on an iPad with one
// finger while standing in a lesson, and it is testable without a touch device.
// Pointer drag is a second gesture over the very same actions — if dragging
// ever misbehaves on some tablet, tapping still does everything.
//
// Three modes on one board: 調位 (move people), 分組 (paint seats into
// groups), 佈置 (turn empty cells into aisles / doors and resize the room).

export type BoardStudent = { id: string; name: string | null; tag: string }

type Selection = { kind: "cell"; index: number } | { kind: "tray"; id: string } | null
type Mode = "move" | "group" | "layout"
type SaveState = "idle" | "saving" | "saved" | "error"

const DRAG_THRESHOLD = 8

export function SeatingBoard({
  initial,
  roster,
  onSave,
  exportHref,
  big = false,
  externalLayout,
  onChange,
}: {
  initial: SeatingLayout
  roster: BoardStudent[]
  onSave: (layout: SeatingLayout) => Promise<string | null> // null = ok, else error message
  exportHref: string
  big?: boolean
  /** A layout pushed from outside (e.g. 分組器 applied groups). Replaces the board's. */
  externalLayout?: SeatingLayout | null
  /** Told about every change, so sibling tools (分組器, 計分牌) see the current chart. */
  onChange?: (layout: SeatingLayout) => void
}) {
  const [layout, setLayout] = useState(initial)
  const [past,   setPast]   = useState<SeatingLayout[]>([])
  const [sel,    setSel]    = useState<Selection>(null)
  const [mode,   setMode]   = useState<Mode>("move")
  const [activeGroup, setActiveGroup] = useState<string | null>(initial.groups[0]?.id ?? null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveErr,   setSaveErr]   = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const dirty = useRef(false)

  const byId = useMemo(() => new Map(roster.map((r) => [r.id, r])), [roster])
  const seated = useMemo(() => S.seatedIds(layout), [layout])
  const unseated = useMemo(() => roster.filter((r) => !seated.has(r.id)), [roster, seated])

  // Every change goes through here: snapshot for 復原, mark dirty for autosave.
  const commit = useCallback((next: SeatingLayout) => {
    setLayout((prev) => {
      if (next === prev) return prev
      setPast((p) => [...p.slice(-19), prev])
      dirty.current = true
      return next
    })
  }, [])

  useEffect(() => {
    if (externalLayout) commit(externalLayout)
  }, [externalLayout, commit])

  useEffect(() => { onChange?.(layout) }, [layout, onChange])

  // Debounced autosave — a chart is edited in bursts, so per-tap saves would be
  // chatter. A failed save is shown, never swallowed.
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(async () => {
      dirty.current = false
      setSaveState("saving")
      const err = await onSave(layout)
      if (err) { setSaveState("error"); setSaveErr(err); dirty.current = true }
      else     { setSaveState("saved"); setSaveErr(null) }
    }, 800)
    return () => clearTimeout(t)
  }, [layout, onSave])

  function undo() {
    setPast((p) => {
      if (p.length === 0) return p
      setLayout(p[p.length - 1])
      dirty.current = true
      return p.slice(0, -1)
    })
    setSel(null)
  }

  // ─── the actions both gestures share ────────────────────────────────────
  function tapCell(index: number) {
    const cell = layout.cells[index]
    if (mode === "layout") {
      if (cell.kind === "seat" && cell.studentId) { setNote("有學生坐的座位不能改成走廊／門，請先移出學生"); return }
      setNote(null)
      commit(S.cycleCellKind(layout, index)); return
    }
    if (mode === "group") {
      if (!activeGroup) { setNote("請先揀或新增一個組別"); return }
      commit(S.toggleSeatGroup(layout, index, activeGroup)); return
    }
    // move
    if (!sel) {
      if (cell.kind === "seat" && cell.studentId) setSel({ kind: "cell", index })
      return
    }
    if (sel.kind === "cell") {
      if (sel.index !== index) commit(S.swapCells(layout, sel.index, index))
      setSel(null); return
    }
    // a tray student into this cell (bumping any occupant back to the tray)
    commit(S.placeStudent(layout, index, sel.id))
    setSel(null)
  }

  function tapTray(id: string) {
    if (mode !== "move") return
    if (sel?.kind === "cell") {
      // Selected seat + tap a tray student = put them in that seat.
      commit(S.placeStudent(layout, sel.index, id)); setSel(null); return
    }
    setSel(sel?.kind === "tray" && sel.id === id ? null : { kind: "tray", id })
  }

  function dropToTray(index: number) {
    commit(S.unseat(layout, index))
    setSel(null)
  }

  // ─── pointer drag over the same actions ─────────────────────────────────
  const drag = useRef<{ from: Selection; x: number; y: number; moved: boolean } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null)

  function onPointerDown(e: React.PointerEvent, from: Selection) {
    if (mode !== "move" || e.button > 0) return
    drag.current = { from, x: e.clientX, y: e.clientY, moved: false }
    // Capture, so the move/up events keep coming to this element even as the
    // finger crosses other seats; the drop target is resolved on release.
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent, label: string) {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return
    d.moved = true
    setGhost({ x: e.clientX, y: e.clientY, label })
  }
  function onPointerUp(e: React.PointerEvent, tap: () => void) {
    const d = drag.current
    drag.current = null
    setGhost(null)
    if (!d) return
    if (!d.moved) { tap(); return }
    // Resolve what's under the finger now.
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const cellEl = el?.closest("[data-cell]") as HTMLElement | null
    const trayEl = el?.closest("[data-tray]")
    if (cellEl) {
      const to = Number(cellEl.dataset.cell)
      if (d.from?.kind === "cell" && d.from.index !== to) commit(S.swapCells(layout, d.from.index, to))
      if (d.from?.kind === "tray") commit(S.placeStudent(layout, to, d.from.id))
    } else if (trayEl && d.from?.kind === "cell") {
      dropToTray(d.from.index)
    }
    setSel(null)
  }

  // ─── toolbar actions ────────────────────────────────────────────────────
  function autoSeat() {
    if (seated.size > 0 && !confirm("按學號重新排座？現有座位會被取代（可以按「復原」）。")) return
    // The roster arrives already in class-number order (by form class + number
    // for a teaching group), so seat in that order.
    const { layout: next, unseated: n } = S.autoSeatByNumber(layout, roster.map((r, i) => ({
      id: r.id, classNumber: String(i + 1), name: r.name,
    })))
    commit(next)
    setNote(n > 0 ? `座位不足：${n} 人未入座，可以加大座位表` : null)
  }

  function clearSeats() {
    if (!confirm("清空所有座位？學生會回到「未入座」。")) return
    commit({ ...layout, cells: layout.cells.map((c) => (c.kind === "seat" ? { ...c, studentId: null } : c)) })
  }

  function resize(rows: number, cols: number) {
    rows = Math.max(1, Math.min(S.MAX_ROWS, rows))
    cols = Math.max(1, Math.min(S.MAX_COLS, cols))
    // Shrinking must not silently unseat anyone: they go to the tray and we say so.
    const next = S.resize(layout, rows, cols)
    const kept = S.seatedIds(next)
    const lost = Array.from(seated).filter((id) => !kept.has(id)).length
    if (lost > 0 && !confirm(`縮細座位表會令 ${lost} 位學生回到「未入座」，確定？`)) return
    commit(next)
  }

  function addGroup() {
    const { layout: next, group } = S.addGroup(layout)
    commit(next)
    setActiveGroup(group.id)
  }

  // ─── render ─────────────────────────────────────────────────────────────
  const cellH = big ? 96 : 64
  const front = (
    <div className="rounded-input text-center py-1.5 text-caption font-medium text-white"
      style={{ background: "var(--color-ink-700)", fontSize: big ? 18 : undefined }}>講　台</div>
  )

  const groupColor = (id?: string) => {
    const g = id ? layout.groups.find((x) => x.id === id) : undefined
    return g ? `#${g.color}` : null
  }

  const statusText =
    saveState === "saving" ? "儲存中…" :
    saveState === "saved"  ? "已儲存" :
    saveState === "error"  ? `⚠ 儲存失敗：${saveErr}` : ""

  return (
    <div className="space-y-3 select-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-input" style={{ background: "var(--color-surface-2)" }}>
          {([["move", "調位"], ["group", "分組"], ["layout", "佈置"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setSel(null); setNote(null) }}
              className="px-3 py-1.5 text-caption font-medium rounded-input"
              style={{
                background: mode === m ? "var(--color-surface)" : "transparent",
                color:      mode === m ? "var(--color-ink-900)" : "var(--color-ink-500)",
                boxShadow:  mode === m ? "0 1px 3px rgb(0 0 0 / 0.06)" : "none",
              }}>{label}</button>
          ))}
        </div>

        {mode === "move" && (
          <>
            <ToolBtn onClick={autoSeat}>自動排座（按學號）</ToolBtn>
            <ToolBtn onClick={clearSeats}>清空座位</ToolBtn>
          </>
        )}
        <ToolBtn onClick={undo} disabled={past.length === 0}>↶ 復原</ToolBtn>
        <a href={exportHref} className="text-caption px-3 py-1.5 rounded-input border"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)", background: "var(--color-surface)" }}>
          ⬇ 匯出 Excel
        </a>
        <span className="text-caption ml-auto" style={{ color: saveState === "error" ? "var(--color-discipline)" : "var(--color-ink-400)" }}>
          {statusText}
        </span>
      </div>

      {/* Mode help + mode-specific controls */}
      {mode === "move" && (
        <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          {sel
            ? sel.kind === "tray"
              ? `已揀「${byId.get(sel.id)?.name ?? ""}」— 點一個座位放入（有人坐就會對調回未入座）`
              : "已揀一位學生 — 點另一個座位對調，或點下面「未入座」的學生換入"
            : "點一位學生，再點另一個座位對調。亦可以直接拖動。"}
          {sel && <button onClick={() => setSel(null)} className="ml-2 underline">取消</button>}
          {sel?.kind === "cell" && (
            <button onClick={() => dropToTray(sel.index)} className="ml-2 underline">移出座位</button>
          )}
        </p>
      )}

      {mode === "group" && (
        <div className="flex flex-wrap items-center gap-2">
          {layout.groups.map((g) => (
            <button key={g.id} onClick={() => setActiveGroup(g.id)}
              className="text-caption px-2.5 py-1 rounded-pill border-2"
              style={{ background: `#${g.color}`, color: "#1f2937", borderColor: activeGroup === g.id ? "var(--color-ink-900)" : "transparent" }}>
              {g.name}（{layout.cells.filter((c) => c.kind === "seat" && c.group === g.id).length}）
            </button>
          ))}
          <ToolBtn onClick={addGroup}>＋ 新增組別</ToolBtn>
          <ToolBtn onClick={() => {
            const n = parseInt(prompt("依座位次序分成幾組？", "6") ?? "", 10)
            if (n > 0) { const next = S.autoGroup(layout, n, { shuffle: false }); commit(next); setActiveGroup(next.groups[0]?.id ?? null) }
          }}>依座位順序分組</ToolBtn>
          <ToolBtn onClick={() => { const next = S.groupByBlock(layout, 2, 2); commit(next); setActiveGroup(next.groups[0]?.id ?? null) }}>
            每 2×2 一組
          </ToolBtn>
          <ToolBtn onClick={() => { commit(S.clearGroups(layout)); setActiveGroup(null) }} disabled={layout.groups.length === 0}>
            清除分組
          </ToolBtn>
          <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>點座位加入／移出所選組別。想隨機分組，可以用上面的「隨機分組」。</span>
        </div>
      )}

      {mode === "layout" && (
        <div className="flex flex-wrap items-center gap-3 text-caption" style={{ color: "var(--color-ink-700)" }}>
          <Stepper label="行" value={layout.rows} onChange={(v) => resize(v, layout.cols)} max={S.MAX_ROWS} />
          <Stepper label="每行座位" value={layout.cols} onChange={(v) => resize(layout.rows, v)} max={S.MAX_COLS} />
          <ToolBtn onClick={() => commit({ ...layout, frontAtTop: !layout.frontAtTop })}>
            講台：{layout.frontAtTop ? "在上" : "在下"}（切換）
          </ToolBtn>
          <span style={{ color: "var(--color-ink-400)" }}>點空位切換：座位 → 走廊 → 門 → 座位</span>
        </div>
      )}

      {note && <p className="text-caption" style={{ color: "var(--color-admin)" }}>{note}</p>}

      {/* The room */}
      <div className="card p-3 space-y-2 overflow-x-auto">
        {layout.frontAtTop && front}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(${big ? 96 : 64}px, 1fr))` }}>
          {layout.cells.map((cell, i) => {
            const s = cell.kind === "seat" && cell.studentId ? byId.get(cell.studentId) : undefined
            const selected = sel?.kind === "cell" && sel.index === i
            const gc = cell.kind === "seat" ? groupColor(cell.group) : null
            const label = s ? (s.name ?? "") : ""
            return (
              <div key={i} data-cell={i}
                onPointerDown={(e) => s && onPointerDown(e, { kind: "cell", index: i })}
                onPointerMove={(e) => onPointerMove(e, label)}
                onPointerUp={(e) => onPointerUp(e, () => tapCell(i))}
                onClick={(e) => { if (!s || mode !== "move") { e.preventDefault(); tapCell(i) } }}
                className="rounded-input flex flex-col items-center justify-center text-center px-1 cursor-pointer"
                style={{
                  height: cellH,
                  touchAction: s && mode === "move" ? "none" : "manipulation",
                  ...(cell.kind === "blank"
                    ? { border: "1px dashed var(--color-border)", background: "transparent" }
                    : cell.kind === "label"
                    ? { background: "var(--color-surface-2)", color: "var(--color-ink-400)" }
                    : {
                        background: gc ?? (s ? "var(--color-surface)" : "var(--color-surface-2)"),
                        border: `2px solid ${selected ? "var(--color-accent)" : s ? "var(--color-border-strong)" : "var(--color-border)"}`,
                        boxShadow: selected ? "0 0 0 3px var(--color-accent-soft)" : undefined,
                        color: gc ? "#1f2937" : undefined,
                      }),
                }}>
                {cell.kind === "label" && <span style={{ fontSize: big ? 18 : 12 }}>{cell.text}</span>}
                {cell.kind === "blank" && mode === "layout" && <span className="text-caption" style={{ color: "var(--color-ink-300)" }}>走廊</span>}
                {cell.kind === "seat" && (s ? (
                  <>
                    <span className="tabular-nums" style={{ fontSize: big ? 15 : 10, color: "var(--color-ink-500)" }}>{s.tag}</span>
                    <span className="font-medium leading-tight truncate w-full" style={{ fontSize: big ? 22 : 13 }}>{s.name ?? "—"}</span>
                  </>
                ) : (
                  <span style={{ fontSize: big ? 14 : 10, color: "var(--color-ink-300)" }}>空位</span>
                ))}
              </div>
            )
          })}
        </div>
        {!layout.frontAtTop && front}
      </div>

      {/* 未入座 tray — the only way to seat someone newly added to the class. */}
      <div data-tray className="rounded-input p-3"
        style={{ background: "var(--color-surface-2)", border: "1px dashed var(--color-border)" }}>
        <p className="text-caption mb-2" style={{ color: "var(--color-ink-500)" }}>
          未入座（{unseated.length}）{mode === "move" && "— 拖座位上的學生到這裡可以移出座位"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {unseated.length === 0 && <span className="text-caption" style={{ color: "var(--color-ink-300)" }}>全部已入座</span>}
          {unseated.map((r) => {
            const selected = sel?.kind === "tray" && sel.id === r.id
            return (
              <span key={r.id}
                onPointerDown={(e) => onPointerDown(e, { kind: "tray", id: r.id })}
                onPointerMove={(e) => onPointerMove(e, r.name ?? "")}
                onPointerUp={(e) => onPointerUp(e, () => tapTray(r.id))}
                className="text-caption px-2.5 py-1 rounded-pill cursor-pointer"
                style={{
                  touchAction: "none",
                  background: selected ? "var(--color-accent)" : "var(--color-surface)",
                  color: selected ? "white" : "var(--color-ink-700)",
                  border: "1px solid var(--color-border)",
                }}>
                {r.tag && <span className="tabular-nums mr-1 opacity-70">{r.tag}</span>}{r.name ?? "—"}
              </span>
            )
          })}
        </div>
      </div>

      {ghost && (
        <div className="fixed z-[70] pointer-events-none px-3 py-1.5 rounded-input text-body font-medium text-white"
          style={{ left: ghost.x + 8, top: ghost.y + 8, background: "var(--color-accent)", boxShadow: "0 6px 18px rgb(0 0 0 / 0.2)" }}>
          {ghost.label}
        </div>
      )}
    </div>
  )
}

function ToolBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-caption px-3 py-1.5 rounded-input border"
      style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)", background: "var(--color-surface)", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  )
}

function Stepper({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <span className="flex items-center gap-1">
      {label}
      <button onClick={() => onChange(value - 1)} disabled={value <= 1}
        className="w-7 h-7 rounded-input border" style={{ border: "1px solid var(--color-border)" }}>－</button>
      <span className="tabular-nums w-6 text-center">{value}</span>
      <button onClick={() => onChange(value + 1)} disabled={value >= max}
        className="w-7 h-7 rounded-input border" style={{ border: "1px solid var(--color-border)" }}>＋</button>
    </span>
  )
}
