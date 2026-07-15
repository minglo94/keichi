"use client"

import { useEffect, useRef, useState } from "react"
import { CommitteeBadge } from "@/components/teacher/CommitteeBadge"

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"

type CommitteeRole = {
  committee: CommitteeType
  isChair:   boolean
}

type ClassInfo = {
  id: string
  name: string
  classCode: string
}

type User = {
  id:             string
  name:           string | null
  email:          string | null
  image:          string | null
  role:           "TEACHER" | "STUDENT" | "ADMIN"
  createdAt:      string
  committeeRoles: CommitteeRole[]
  enrollments:    { class: ClassInfo }[]
}

const COMMITTEES: { value: CommitteeType; label: string }[] = [
  { value: "ADMIN",      label: "行政"     },
  { value: "DISCIPLINE", label: "訓育"     },
  { value: "IT",         label: "資訊科技" },
  { value: "CURRICULUM", label: "課程發展" },
  { value: "ECA",        label: "課外活動" },
]

function Avatar({ user, size = 32 }: { user: User; size?: number }) {
  const initials = user.name ? user.name.slice(0, 1) : "?"
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.image} alt={user.name ?? ""} className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }} />
  }
  return (
    <div className="rounded-full shrink-0 flex items-center justify-center text-white font-medium"
      style={{ width: size, height: size, background: "var(--color-accent)", fontSize: size * 0.44 }}>
      {initials}
    </div>
  )
}

type ImportResult = { created: number; updated: number; errors: { row: number; email: string; reason: string }[] }

export default function AdminUsersPage() {
  const [users,        setUsers]        = useState<User[]>([])
  const [classes,      setClasses]      = useState<ClassInfo[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState<string | null>(null)
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const [uRes, cRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/classes")
    ])
    if (uRes.ok) setUsers(await uRes.json())
    if (cRes.ok) setClasses(await cRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteUser(id: string) {
    if (!confirm("確定要刪除此用戶嗎？此動作無法復原。")) return
    setSaving(id)
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" })
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id))
    }
    setSaving(null)
  }

  async function toggleRole(user: User) {
    const newRole = user.role === "STUDENT" ? "TEACHER" : user.role === "TEACHER" ? "ADMIN" : "STUDENT"
    setSaving(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      const updated: User = await res.json()
      setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, ...updated } : u))
    }
    setSaving(null)
  }

  async function addToCommittee(userId: string, committee: CommitteeType, isChair: boolean) {
    setSaving(`${userId}-${committee}`)
    const res = await fetch("/api/admin/committee-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, committee, isChair }),
    })
    if (res.ok) {
      setUsers((prev) => prev.map((u) => {
        if (u.id !== userId) return u
        const existing = u.committeeRoles.filter((r) => r.committee !== committee)
        return { ...u, committeeRoles: [...existing, { committee, isChair }] }
      }))
    }
    setSaving(null)
  }

  async function removeFromCommittee(userId: string, committee: CommitteeType) {
    setSaving(`${userId}-${committee}`)
    const params = new URLSearchParams({ userId, committee })
    const res = await fetch(`/api/admin/committee-roles?${params}`, { method: "DELETE" })
    if (res.ok) {
      setUsers((prev) => prev.map((u) => {
        if (u.id !== userId) return u
        return { ...u, committeeRoles: u.committeeRoles.filter((r) => r.committee !== committee) }
      }))
    }
    setSaving(null)
  }

  async function toggleChair(userId: string, committee: CommitteeType, currentIsChair: boolean) {
    await addToCommittee(userId, committee, !currentIsChair)
  }

  function downloadCsv() {
    const a = document.createElement("a")
    a.href = "/api/admin/users/export"
    a.download = "users.csv"
    a.click()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const form = new FormData()
    form.append("file", file)
    const res = await fetch("/api/admin/users/import", { method: "POST", body: form })
    const result: ImportResult = await res.json()
    setImportResult(result)
    setImporting(false)
    if (result.created > 0 || result.updated > 0) await load()
    if (importRef.current) importRef.current.value = ""
  }

  const admins   = users.filter((u) => u.role === "ADMIN")
  const teachers = users.filter((u) => u.role === "TEACHER")
  const students = users.filter((u) => u.role === "STUDENT")

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h1">用戶管理</h1>
          <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            管理教職員、學生帳號及班別分配
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="text-caption px-3 py-1.5 rounded-input border transition-colors"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
          >
            新增用戶
          </button>
          <button
            onClick={downloadCsv}
            className="text-caption px-3 py-1.5 rounded-input border transition-colors"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
          >
            下載 CSV
          </button>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="text-caption px-3 py-1.5 rounded-input text-white transition-colors"
            style={{ background: "var(--color-accent)" }}
          >
            {importing ? "匯入中…" : "匯入 CSV"}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </div>

      {importResult && (
        <div className="card p-4 mb-6 space-y-2" style={{ borderLeft: "4px solid var(--color-accent)" }}>
          <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
            匯入完成：新增 {importResult.created} 人，更新 {importResult.updated} 人
            {importResult.errors.length > 0 && `，${importResult.errors.length} 個錯誤`}
          </p>
          {importResult.errors.length > 0 && (
            <table className="w-full text-caption" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--color-ink-500)" }}>
                  <th className="text-left py-1 pr-4">行</th>
                  <th className="text-left py-1 pr-4">Email</th>
                  <th className="text-left py-1">原因</th>
                </tr>
              </thead>
              <tbody>
                {importResult.errors.map((e, i) => (
                  <tr key={i} style={{ color: "var(--color-discipline)" }}>
                    <td className="py-0.5 pr-4">{e.row}</td>
                    <td className="py-0.5 pr-4">{e.email}</td>
                    <td className="py-0.5">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button onClick={() => setImportResult(null)} className="text-caption" style={{ color: "var(--color-ink-400)" }}>
            關閉
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
      ) : (
        <div className="space-y-8">
          {admins.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-h2">管理員</h2>
                <span className="text-caption px-2 py-0.5 rounded-pill font-medium" style={{ background: "var(--color-discipline-soft)", color: "var(--color-discipline)" }}>
                  {admins.length}
                </span>
              </div>
              <div className="space-y-3">
                {admins.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    saving={saving}
                    onToggleRole={toggleRole}
                    onDelete={deleteUser}
                    onAddCommittee={addToCommittee}
                    onRemoveCommittee={removeFromCommittee}
                    onToggleChair={toggleChair}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-h2">教職員</h2>
              <span className="text-caption px-2 py-0.5 rounded-pill font-medium" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                {teachers.length}
              </span>
            </div>
            <div className="space-y-3">
              {teachers.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  saving={saving}
                  onToggleRole={toggleRole}
                  onDelete={deleteUser}
                  onAddCommittee={addToCommittee}
                  onRemoveCommittee={removeFromCommittee}
                  onToggleChair={toggleChair}
                />
              ))}
              {teachers.length === 0 && <p className="text-body" style={{ color: "var(--color-ink-300)" }}>無</p>}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-h2">學生帳號</h2>
              <span className="text-caption px-2 py-0.5 rounded-pill font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-500)" }}>
                {students.length}
              </span>
            </div>
            <div className="space-y-2">
              {students.map((user) => (
                <div key={user.id} className="card px-4 py-3 flex items-center gap-3">
                  <Avatar user={user} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{user.name ?? "—"}</p>
                      {user.enrollments.map((e) => (
                        <span key={e.class.id} className="text-caption px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                          {e.class.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleRole(user)}
                      disabled={saving === user.id}
                      className="text-caption px-3 py-1.5 rounded-input border"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
                    >
                      升為教職員 →
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      disabled={saving === user.id}
                      className="p-1.5 text-discipline opacity-50 hover:opacity-100 transition-opacity"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                </div>
              ))}
              {students.length === 0 && <p className="text-body" style={{ color: "var(--color-ink-300)" }}>無</p>}
            </div>
          </section>
        </div>
      )}

      {showAddModal && (
        <AddUserModal
          classes={classes}
          onClose={() => setShowAddModal(false)}
          onSuccess={(u) => { setUsers(prev => [...prev, u]); setShowAddModal(false); }}
        />
      )}
    </div>
  )
}

function UserRow({
  user, saving, onToggleRole, onDelete, onAddCommittee, onRemoveCommittee, onToggleChair,
}: {
  user:               User
  saving:             string | null
  onToggleRole:       (u: User) => void
  onDelete:           (id: string) => void
  onAddCommittee:     (userId: string, c: CommitteeType, isChair: boolean) => void
  onRemoveCommittee:  (userId: string, c: CommitteeType) => void
  onToggleChair:      (userId: string, c: CommitteeType, current: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const getRole = (c: CommitteeType) => user.committeeRoles.find((r) => r.committee === c)

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <Avatar user={user} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{user.name ?? "—"}</p>
            <div className="flex gap-1 flex-wrap">
              {user.committeeRoles.map(({ committee, isChair }) => (
                <span key={committee} className="relative">
                  <CommitteeBadge committee={committee} />
                  {isChair && <span className="ml-0.5 text-caption" style={{ color: "var(--color-ink-500)" }}>★</span>}
                </span>
              ))}
            </div>
          </div>
          <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>{user.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setExpanded((v) => !v)} className="text-caption px-3 py-1.5 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "var(--color-accent)" }}>
            委員會 {expanded ? "▲" : "▼"}
          </button>
          <button onClick={() => onToggleRole(user)} disabled={saving === user.id} className="text-caption px-3 py-1.5 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>
            {user.role === "ADMIN" ? "→ 教職員" : "→ 學生"}
          </button>
          <button onClick={() => onDelete(user.id)} disabled={saving === user.id} className="p-1.5 text-discipline opacity-50 hover:opacity-100 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          {COMMITTEES.map(({ value: c, label }) => {
            const role = getRole(c)
            const isMember = !!role
            const isSaving = saving === `${user.id}-${c}`
            return (
              <div key={c} className="rounded-input p-3 flex flex-col gap-2" style={{ background: isMember ? "var(--color-accent-soft)" : "var(--color-surface-2)" }}>
                <div className="flex items-center justify-between">
                  <CommitteeBadge committee={c} />
                  {isMember && <button onClick={() => onRemoveCommittee(user.id, c)} disabled={isSaving} className="text-caption leading-none" style={{ color: "var(--color-ink-300)" }}>×</button>}
                </div>
                {isMember ? (
                  <button onClick={() => onToggleChair(user.id, c, role.isChair)} disabled={isSaving} className="text-caption py-1 rounded text-left" style={{ color: role.isChair ? "var(--color-accent)" : "var(--color-ink-500)" }}>
                    {role.isChair ? "★ 主席" : "一般成員"}
                  </button>
                ) : (
                  <button onClick={() => onAddCommittee(user.id, c, false)} disabled={isSaving} className="text-caption py-1 rounded" style={{ color: "var(--color-ink-500)" }}>
                    {isSaving ? "…" : "+ 加入"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AddUserModal({ classes, onClose, onSuccess }: { classes: ClassInfo[], onClose: () => void, onSuccess: (u: User) => void }) {
  const [form, setForm] = useState({ 
    email: "", 
    name: "", 
    role: "STUDENT" as const, 
    password: "",
    committees: [] as CommitteeType[],
    classCode: "" 
  })
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    })
    if (res.ok) {
      const newUser = await res.json()
      // For local update, populate with what we know
      onSuccess({ 
        ...newUser, 
        committeeRoles: form.committees.map(c => ({ committee: c, isChair: false })), 
        enrollments: form.classCode ? [{ class: classes.find(c => c.classCode === form.classCode)! }] : [] 
      })
    } else {
      const { error } = await res.json()
      alert(error)
    }
    setBusy(false)
  }

  const toggleCommittee = (c: CommitteeType) => {
    setForm(v => ({
      ...v,
      committees: v.committees.includes(c) 
        ? v.committees.filter(item => item !== c)
        : [...v.committees, c]
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b shrink-0">
          <h3 className="text-h2">新增用戶</h3>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="text-caption block mb-1 font-medium">Email (必填)</label>
            <input required type="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} className="w-full rounded-input border p-2 text-body" placeholder="example@school.hk" />
          </div>
          <div>
            <label className="text-caption block mb-1 font-medium">姓名</label>
            <input type="text" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} className="w-full rounded-input border p-2 text-body" placeholder="輸入姓名" />
          </div>
          <div>
            <label className="text-caption block mb-1 font-medium">密碼 (選填)</label>
            <input type="password" value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))} className="w-full rounded-input border p-2 text-body" placeholder="如需密碼登入請填寫" />
            <p className="text-[10px] text-gray-400 mt-1">留空則僅限 Google 登入</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-caption block mb-1 font-medium">角色</label>
              <select value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value as any }))} className="w-full rounded-input border p-2 text-body">
                <option value="STUDENT">學生</option>
                <option value="TEACHER">教職員</option>
                <option value="ADMIN">管理員</option>
              </select>
            </div>
            {form.role === "STUDENT" && (
              <div>
                <label className="text-caption block mb-1 font-medium">班別</label>
                <select value={form.classCode} onChange={e => setForm(v => ({ ...v, classCode: e.target.value }))} className="w-full rounded-input border p-2 text-body">
                  <option value="">— 未分配 —</option>
                  {classes.map(c => <option key={c.id} value={c.classCode}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-caption block mb-1 font-medium">委員會分配</label>
            <div className="grid grid-cols-2 gap-2">
              {COMMITTEES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-gray-50 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={form.committees.includes(value)} 
                    onChange={() => toggleCommittee(value)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-caption">{label}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="flex gap-2 pt-4 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-input border font-medium">取消</button>
            <button type="submit" disabled={busy} className="flex-1 py-2 rounded-input bg-blue-600 text-white font-medium disabled:opacity-50">
              {busy ? "提交中…" : "確認新增"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
