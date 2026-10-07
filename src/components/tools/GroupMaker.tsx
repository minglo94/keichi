"use client"

import { useState } from "react"
import { GROUP_COLORS, randomGroups } from "@/lib/seating"
import type { PickItem } from "@/components/tools/RandomPicker"

// 分組器: random groups from the roster, by number of groups or by group size.
// 「套用到座位表」 writes them onto the seating chart so grouping and seating are
// one arrangement, not two lists that drift apart.

export function GroupMaker({
  items,
  onApply,
  big = false,
}: {
  items: PickItem[]
  /** Write the groups onto the seating chart. Omit to hide the button. */
  onApply?: (groups: string[][]) => void
  big?: boolean
}) {
  const [by,     setBy]     = useState<"count" | "size">("count")
  const [n,      setN]      = useState(6)
  const [groups, setGroups] = useState<string[][] | null>(null)

  const labelOf = new Map(items.map((i) => [i.id, i.label]))
  const groupCount = by === "count" ? n : Math.ceil(items.length / Math.max(1, n))

  function make() {
    setGroups(randomGroups(items.map((i) => i.id), groupCount))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={by} onChange={(e) => setBy(e.target.value as "count" | "size")}
          className="px-3 py-2 text-body rounded-input border outline-none"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}>
          <option value="count">分成幾組</option>
          <option value="size">每組幾人</option>
        </select>
        <input type="number" min={1} max={Math.max(1, items.length)} value={n}
          onChange={(e) => setN(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-20 px-2 py-2 text-body rounded-input border outline-none"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
        <button onClick={make} disabled={items.length === 0}
          className="px-4 py-2 rounded-input text-body font-medium text-white"
          style={{ background: "var(--color-accent)", opacity: items.length === 0 ? 0.5 : 1 }}>
          {groups ? "重新分組" : "分組"}
        </button>
        {groups && onApply && (
          <button onClick={() => onApply(groups)}
            className="px-4 py-2 rounded-input text-body border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>
            套用到座位表
          </button>
        )}
        <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          {items.length} 人 → {groupCount} 組
        </span>
      </div>

      {groups && (
        <div className={`grid gap-3 ${big ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 md:grid-cols-3"}`}>
          {groups.map((g, i) => (
            <div key={i} className="rounded-card p-3"
              style={{ background: `#${GROUP_COLORS[i % GROUP_COLORS.length]}`, color: "#1f2937" }}>
              <p className={big ? "text-h2 mb-1" : "text-body font-semibold mb-1"}>第{i + 1}組（{g.length}）</p>
              <p className={big ? "text-h3" : "text-caption"} style={{ lineHeight: 1.6 }}>
                {g.map((id) => labelOf.get(id) ?? "—").join("、")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
