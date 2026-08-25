"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

type Committee = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"
type Target    = "ALL" | "COMMITTEE" | "USERS"

type Staff = {
  id:    string
  name:  string | null
  email: string | null
  image: string | null
  role:  "TEACHER" | "ADMIN"
  committeeRoles: { committee: Committee; isChair: boolean }[]
}

const COMMITTEE_LABELS: Record<Committee, string> = {
  ADMIN:      "行政",
  DISCIPLINE: "訓育",
  IT:         "資訊科技",
  CURRICULUM: "課程發展",
  ECA:        "課外活動",
}

const TARGETS: { id: Target; label: string; hint: string }[] = [
  { id: "ALL",       label: "全體教職員", hint: "所有老師及管理員" },
  { id: "COMMITTEE", label: "指定組別",   hint: "該組別的所有成員" },
  { id: "USERS",     label: "指定教師",   hint: "自行挑選收件人" },
]

export default function BroadcastPage() {
  const [staff,   setStaff]   = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [denied,  setDenied]  = useState(false)

  const [title,     setTitle]     = useState("")
  const [body,      setBody]      = useState("")
  const [link,      setLink]      = useState("")
  const [target,    setTarget]    = useState<Target>("ALL")
  const [committee, setCommittee] = useState<Committee>("ADMIN")
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [search,    setSearch]    = useState("")

  const [sending, setSending] = useState(false)
  const [result,  setResult]  = useState<string | null>(null)
  const [err,     setErr]     = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/broadcast")
      .then((r) => {
        if (r.status === 403) { setDenied(true); return null }
        return r.ok ? r.json() : null
      })
      .then((d: { staff: Staff[] } | null) => { if (d) setStaff(d.staff) })
      .finally(() => setLoading(false))
  }, [])

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return staff
    return staff.filter((s) =>
      (s.name ?? "").toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q))
  }, [staff, search])

  // How many people this will actually reach, mirroring the API's resolution.
  const recipientCount = useMemo(() => {
    if (target === "ALL")       return staff.length
    if (target === "COMMITTEE") return staff.filter((s) => s.committeeRoles.some((r) => r.committee === committee)).length
    return selected.size
  }, [target, committee, selected, staff])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setSending(true); setErr(null); setResult(null)

    const res = await fetch("/api/admin/broadcast", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        body:  body.trim() || undefined,
        link:  link.trim() || undefined,
        target,
        committee: target === "COMMITTEE" ? committee : undefined,
        userIds:   target === "USERS" ? Array.from(selected) : undefined,
      }),
    })
    setSending(false)

    if (res.ok) {
      const d = await res.json()
      setResult(`已推送給 ${d.sent} 位教職員`)
      setTitle(""); setBody(""); setLink(""); setSelected(new Set())
    } else {
      const d = await res.json().catch(() => ({}))
      setErr(d?.error ?? `推送失敗 (${res.status})`)
    }
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="card p-8 text-center text-body" style={{ color: "var(--color-ink-400)" }}>僅管理員可存取。</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 老師主頁</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">推送訊息</h1>
      </div>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        即時推送通知俾教職員（會出現喺右下角的通知鈴）。此訊息唔會存為公告紀錄。
      </p>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : (
        <form onSubmit={send} className="card p-5 space-y-5">
          {/* Message */}
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>標題 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200}
              placeholder="例：明天下午 3:00 全體教師會議" className={inputCls} style={inputStyle} />
          </div>

          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>內容（選填）</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000}
              className={inputCls} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>連結（選填）</label>
            <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={300}
              placeholder="/teacher/calendar" className={inputCls} style={inputStyle} />
            <p className="text-[11px] mt-1" style={{ color: "var(--color-ink-400)" }}>
              收件人點擊通知時會開啟此站內路徑。
            </p>
          </div>

          {/* Recipients */}
          <div>
            <label className="text-caption block mb-2" style={{ color: "var(--color-ink-700)" }}>收件人</label>
            <div className="space-y-2">
              {TARGETS.map((t) => (
                <button key={t.id} type="button" onClick={() => setTarget(t.id)}
                  className="w-full text-left p-3 rounded-input border transition-colors"
                  style={{
                    border: `1px solid ${target === t.id ? "var(--color-accent)" : "var(--color-border)"}`,
                    background: target === t.id ? "var(--color-accent-soft)" : "var(--color-surface)",
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: target === t.id ? "var(--color-accent)" : "transparent", border: `2px solid ${target === t.id ? "var(--color-accent)" : "var(--color-ink-300)"}` }} />
                    <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{t.label}</span>
                  </div>
                  <p className="text-caption mt-1 ml-5" style={{ color: "var(--color-ink-500)" }}>{t.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {target === "COMMITTEE" && (
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>組別</label>
              <select value={committee} onChange={(e) => setCommittee(e.target.value as Committee)}
                className={inputCls} style={inputStyle}>
                {(Object.keys(COMMITTEE_LABELS) as Committee[]).map((c) => (
                  <option key={c} value={c}>{COMMITTEE_LABELS[c]}</option>
                ))}
              </select>
            </div>
          )}

          {target === "USERS" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-caption" style={{ color: "var(--color-ink-700)" }}>
                  選擇教師（已選 {selected.size} 位）
                </label>
                {selected.size > 0 && (
                  <button type="button" onClick={() => setSelected(new Set())}
                    className="text-caption" style={{ color: "var(--color-accent)" }}>清除</button>
                )}
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋姓名或電郵…" className={`${inputCls} mb-2`} style={inputStyle} />
              <div className="max-h-56 overflow-y-auto rounded-input" style={{ border: "1px solid var(--color-border)" }}>
                {filteredStaff.length === 0 ? (
                  <p className="text-caption p-3 text-center" style={{ color: "var(--color-ink-400)" }}>沒有符合的教職員</p>
                ) : filteredStaff.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                    style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    <span className="text-body flex-1 min-w-0 truncate" style={{ color: "var(--color-ink-900)" }}>
                      {s.name ?? s.email}
                    </span>
                    {s.role === "ADMIN" && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-pill shrink-0"
                        style={{ background: "var(--color-admin-soft)", color: "var(--color-admin)" }}>管理員</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {err    && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>{err}</p>}
          {result && <p className="text-caption" style={{ color: "var(--color-curriculum)" }}>✓ {result}</p>}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>
              將推送給 {recipientCount} 位（不包括自己）
            </span>
            <button type="submit" disabled={sending || !title.trim() || recipientCount === 0}
              className="px-4 py-2 text-body font-medium rounded-input text-white"
              style={{ background: "var(--color-accent)", opacity: sending || !title.trim() || recipientCount === 0 ? 0.6 : 1 }}>
              {sending ? "推送中…" : "推送訊息"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
