"use client"

import { useEffect, useRef, useState } from "react"

type StaffUser = {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

function Avatar({ name, image, size = 28 }: { name?: string | null; image?: string | null; size?: number }) {
  if (image) return <img src={image} alt={name ?? ""} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  const initial = name ? name.slice(0, 1) : "?"
  return (
    <div className="rounded-full shrink-0 flex items-center justify-center text-white font-medium text-xs"
      style={{ width: size, height: size, background: "var(--color-accent, #4f46e5)" }}>
      {initial}
    </div>
  )
}

/**
 * StaffDisplay — shows a staff user row with avatar + name + email.
 * Used inside the picker dropdown list and in class list items.
 */
export function StaffDisplay({
  user,
  size = 28,
  showEmail = true,
  badge,
}: {
  user: StaffUser
  size?: number
  showEmail?: boolean
  badge?: string
}) {
  return (
    <>
      <Avatar name={user.name} image={user.image} size={size} />
      <div className="flex-1 min-w-0">
        <p className="text-body truncate" style={{ color: "var(--color-ink-800)" }}>
          {user.name ?? user.email ?? "—"}
        </p>
        {showEmail && (
          <p className="text-caption truncate" style={{ color: "var(--color-ink-400)" }}>
            {user.email}
          </p>
        )}
      </div>
      {badge && (
        <span
          className="text-caption px-1.5 py-0.5 rounded-pill shrink-0"
          style={{
            background: "var(--color-accent-soft, #ede9fe)",
            color:      "var(--color-accent, #4f46e5)",
          }}
        >
          {badge}
        </span>
      )}
    </>
  )
}

/**
 * StaffInlineBadge — compact read-only display for class list items.
 * Shows tiny avatar + name + badge label.
 */
export function StaffInlineBadge({
  user,
  label = "班主任",
  size = 18,
}: {
  user: StaffUser
  label?: string
  size?: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Avatar name={user.name} image={user.image} size={size} />
      <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>
        {user.name ?? user.email}
      </span>
      {label && (
        <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: "var(--color-accent-soft, #ede9fe)", color: "var(--color-accent, #4f46e5)" }}>
          {label}
        </span>
      )}
    </div>
  )
}

/**
 * PlaceholderAvatar — grey ? circle used when no staff is selected.
 */
function PlaceholderAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center text-white font-medium"
      style={{ width: size, height: size, background: "var(--color-ink-300, #cbd5e1)", fontSize: size * 0.45 }}
    >?</div>
  )
}

/**
 * StaffPicker — searchable dropdown to pick a staff member.
 *
 * Usage:
 *   <StaffPicker
 *     staff={staffList}
 *     selectedId={homeroomTeacherId}
 *     onSelect={(id) => setHomeroomTeacherId(id)}
 *     placeholder="指派班主任"
 *     emptyHint="點擊從教職員中選擇"
 *     badge="班主任"
 *   />
 */
export function StaffPicker({
  staff,
  selectedId,
  onSelect,
  placeholder = "指派班主任",
  emptyHint = "點擊從教職員中選擇",
  badge,
}: {
  staff: StaffUser[]
  selectedId: string
  onSelect: (id: string) => void
  placeholder?: string
  emptyHint?: string
  badge?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handler)
      setSearch("")
    }
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const selected = selectedId ? staff.find((s) => s.id === selectedId) : undefined

  const filtered = staff.filter(
    (s) =>
      !search ||
      (s.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors"
        style={{
          background: "var(--color-surface-2, #f9fafb)",
          border:     "1px solid var(--color-border)",
        }}
      >
        {selected ? (
          <StaffDisplay user={selected} badge={badge} />
        ) : (
          <>
            <PlaceholderAvatar size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-body" style={{ color: "var(--color-ink-400)" }}>{placeholder}</p>
              <p className="text-caption" style={{ color: "var(--color-ink-300)" }}>{emptyHint}</p>
            </div>
          </>
        )}

        {selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onSelect("") }}
            className="text-caption px-2 py-1 rounded border transition-colors shrink-0"
            style={{ borderColor: "var(--color-border)", color: "var(--color-discipline, #dc2626)" }}
          >
            清除
          </span>
        )}

        <svg
          className={`transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="var(--color-ink-500, #6b7280)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded-lg flex flex-col overflow-hidden"
          style={{
            background: "var(--color-surface)",
            border:     "1px solid var(--color-border)",
            boxShadow:  "0 8px 24px oklch(0% 0 0 / 12%)",
          }}
        >
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋姓名或電郵…"
            className="w-full px-3 py-2 text-body outline-none border-b"
            style={{ borderColor: "var(--color-border)", color: "var(--color-ink-900)" }}
          />

          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-caption italic py-3 text-center" style={{ color: "var(--color-ink-300)" }}>
                {search ? "找不到相符教職員" : "尚無教職員"}
              </p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onSelect(s.id); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <Avatar name={s.name} image={s.image} size={24} />
                  <div className="flex-1 min-w-0">
                    <p className="text-body truncate" style={{ color: "var(--color-ink-900)" }}>
                      {s.name ?? s.email}
                    </p>
                    <p className="text-caption truncate" style={{ color: "var(--color-ink-400)" }}>
                      {s.email}
                    </p>
                  </div>
                  {selectedId === s.id && (
                    <span
                      className="text-caption px-1.5 py-0.5 rounded-pill shrink-0"
                      style={{
                        background: "var(--color-accent-soft, #ede9fe)",
                        color:      "var(--color-accent, #4f46e5)",
                      }}
                    >
                      {badge ?? placeholder}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
