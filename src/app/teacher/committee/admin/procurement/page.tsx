"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"

type Item = { name: string; spec: string; qty: number; unitPrice: number }

type ProcStatus = "PENDING" | "APPROVED" | "REJECTED" | "ORDERED"

type Request = {
  id:          string
  department:  string
  items:       Item[]
  totalBudget: number
  reason:      string
  supplier:    string | null
  status:      ProcStatus
  note:        string | null
  createdAt:   string
  requester:   { id: string; name: string | null; email: string | null }
}

const STATUS_BADGE: Record<ProcStatus, { label: string; color: string }> = {
  PENDING:  { label: "待審批", color: "var(--color-admin)"       },
  APPROVED: { label: "已批准", color: "var(--color-curriculum)"  },
  REJECTED: { label: "已拒絕", color: "var(--color-discipline)"  },
  ORDERED:  { label: "已訂購", color: "var(--color-it)"          },
}

const emptyItem = (): Item => ({ name: "", spec: "", qty: 1, unitPrice: 0 })

export default function ProcurementPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN"

  const [requests, setRequests] = useState<Request[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Form state
  const [department, setDepartment] = useState("")
  const [items,      setItems]      = useState<Item[]>([emptyItem()])
  const [reason,     setReason]     = useState("")
  const [supplier,   setSupplier]   = useState("")

  function load() {
    setLoading(true)
    fetch("/api/procurement")
      .then((r) => r.ok ? r.json() : [])
      .then(setRequests)
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const total = items.reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0)

  function updateItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const clean = items.filter((it) => it.name.trim())
    if (!department.trim() || clean.length === 0 || !reason.trim()) return
    setSaving(true)
    const res = await fetch("/api/procurement", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ department, items: clean, reason, supplier: supplier || undefined }),
    })
    setSaving(false)
    if (res.ok) {
      setShowForm(false)
      setDepartment(""); setItems([emptyItem()]); setReason(""); setSupplier("")
      load()
    }
  }

  async function setStatus(id: string, status: ProcStatus) {
    const res = await fetch(`/api/procurement/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r))
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/procurement/${id}`, { method: "DELETE" })
    if (res.ok) setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher/committee/admin" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 行政</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">採購申請</h1>
      </div>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        提交及追蹤學校採購申請。{isAdmin ? "作為管理員，你可審批所有申請。" : "管理員會審批你的申請。"}
      </p>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm((v) => !v)}
          className="text-caption px-3 py-1.5 rounded-input text-white"
          style={{ background: "var(--color-admin)" }}>
          {showForm ? "取消" : "+ 新增採購申請"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={submit} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>申請部門 *</label>
              <input required value={department} onChange={(e) => setDepartment(e.target.value)}
                placeholder="例：IT 組" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>建議供應商（選填）</label>
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
                placeholder="例：Dell Hong Kong" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="text-caption block mb-2" style={{ color: "var(--color-ink-700)" }}>採購項目 *</label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input placeholder="項目" value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })}
                    className="col-span-4 px-2 py-1.5 text-caption rounded-input border outline-none" style={inputStyle} />
                  <input placeholder="規格" value={it.spec} onChange={(e) => updateItem(i, { spec: e.target.value })}
                    className="col-span-3 px-2 py-1.5 text-caption rounded-input border outline-none" style={inputStyle} />
                  <input type="number" min={1} placeholder="數量" value={it.qty || ""} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                    className="col-span-2 px-2 py-1.5 text-caption rounded-input border outline-none" style={inputStyle} />
                  <input type="number" min={0} placeholder="單價" value={it.unitPrice || ""} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                    className="col-span-2 px-2 py-1.5 text-caption rounded-input border outline-none" style={inputStyle} />
                  <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    className="col-span-1 text-caption" style={{ color: "var(--color-discipline)" }}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])}
              className="mt-2 text-caption" style={{ color: "var(--color-admin)" }}>+ 加一項</button>
          </div>

          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>申購原因 *</label>
            <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="說明用途及必要性" className={`${inputCls} resize-none`} style={inputStyle} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
              合計預算：HKD {total.toLocaleString()}
            </p>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-body font-medium rounded-input text-white"
              style={{ background: "var(--color-admin)", opacity: saving ? 0.7 : 1 }}>
              {saving ? "提交中…" : "提交申請"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : requests.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--color-ink-300)" }}>
          <p className="text-body">尚無採購申請</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const sb = STATUS_BADGE[r.status]
            return (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{r.department}</p>
                      <span className="text-caption px-2 py-0.5 rounded-pill" style={{ background: `${sb.color}20`, color: sb.color }}>{sb.label}</span>
                    </div>
                    <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                      HKD {r.totalBudget.toLocaleString()} · {r.requester.name ?? r.requester.email} · {new Date(r.createdAt).toLocaleDateString("zh-HK")}
                    </p>
                  </div>
                </div>

                {/* Items table */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr style={{ color: "var(--color-ink-400)" }}>
                        <th className="text-left font-medium pb-1">項目</th>
                        <th className="text-left font-medium pb-1">規格</th>
                        <th className="text-right font-medium pb-1">數量</th>
                        <th className="text-right font-medium pb-1">單價</th>
                        <th className="text-right font-medium pb-1">小計</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: "var(--color-ink-700)" }}>
                      {r.items.map((it, i) => (
                        <tr key={i}>
                          <td className="py-0.5">{it.name}</td>
                          <td className="py-0.5">{it.spec}</td>
                          <td className="py-0.5 text-right">{it.qty}</td>
                          <td className="py-0.5 text-right">{it.unitPrice.toLocaleString()}</td>
                          <td className="py-0.5 text-right">{(it.qty * it.unitPrice).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-caption mt-2" style={{ color: "var(--color-ink-500)" }}>原因：{r.reason}</p>
                {r.supplier && <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>供應商：{r.supplier}</p>}
                {r.note && <p className="text-caption mt-1" style={{ color: "var(--color-discipline)" }}>審批備註：{r.note}</p>}

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  {isAdmin && r.status === "PENDING" && (
                    <>
                      <button onClick={() => setStatus(r.id, "APPROVED")} className="text-caption px-3 py-1 rounded-input text-white" style={{ background: "var(--color-curriculum)" }}>批准</button>
                      <button onClick={() => setStatus(r.id, "REJECTED")} className="text-caption px-3 py-1 rounded-input" style={{ background: "var(--color-discipline)15", color: "var(--color-discipline)" }}>拒絕</button>
                    </>
                  )}
                  {isAdmin && r.status === "APPROVED" && (
                    <button onClick={() => setStatus(r.id, "ORDERED")} className="text-caption px-3 py-1 rounded-input text-white" style={{ background: "var(--color-it)" }}>標記已訂購</button>
                  )}
                  {(isAdmin || r.status === "PENDING") && (
                    <button onClick={() => remove(r.id)} className="text-caption px-3 py-1 rounded-input" style={{ color: "var(--color-ink-400)" }}>刪除</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
