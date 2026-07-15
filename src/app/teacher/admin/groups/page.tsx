"use client"

import { useEffect, useState } from "react"
import { StaffPicker } from "@/components/teacher/StaffPicker"

type GroupType = "FORM_CLASS" | "SUBJECT_CLASS" | "SPECIFIC"

const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  FORM_CLASS:    "班別",
  SUBJECT_CLASS: "科目班",
  SPECIFIC:      "特定小組",
}

const GROUP_TYPE_COLORS: Record<GroupType, string> = {
  FORM_CLASS:    "bg-blue-50 text-blue-700 border-blue-200",
  SUBJECT_CLASS: "bg-purple-50 text-purple-700 border-purple-200",
  SPECIFIC:      "bg-amber-50 text-amber-700 border-amber-200",
}

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"
const COMMITTEE_LABELS: Record<CommitteeType, string> = {
  ADMIN: "行政", DISCIPLINE: "訓育", IT: "資訊科技", CURRICULUM: "課程發展", ECA: "課外活動",
}
const COMMITTEE_COLORS: Record<CommitteeType, string> = {
  ADMIN: "bg-blue-50 text-blue-700", DISCIPLINE: "bg-red-50 text-red-700",
  IT: "bg-green-50 text-green-700", CURRICULUM: "bg-yellow-50 text-yellow-700",
  ECA: "bg-purple-50 text-purple-700",
}

type CommitteeRole = { committee: CommitteeType; isChair: boolean }

type Teacher = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  committeeRoles: CommitteeRole[]
}

type GroupMember = {
  id: string
  joinedAt: string
  user: { id: string; name: string | null; email: string | null; image: string | null }
}

type Group = {
  id: string
  name: string
  type: GroupType
  description: string | null
  isClass?: boolean
  classCode?: string
  homeroomTeacher?: { id: string; name: string | null; email: string | null; image: string | null } | null
  teacher?: { id: string; name: string | null; email: string | null; image: string | null } | null
  _count: { members: number }
}

type GroupDetail = Group & { members: GroupMember[]; teacher?: { id: string; name: string | null; email: string | null; image: string | null } | null }

type Student = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  enrollments?: {
    classNumber: string | null;
    class: { id: string; name: string }
  }[]
}

type Tab = "COMMITTEE" | "STUDENT_GROUPS"

function Avatar({ name, image, size = 28 }: { name?: string | null; image?: string | null; size?: number }) {
  if (image) return <img src={image} alt={name ?? ""} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  const initials = name ? name.slice(0, 1) : "?"
  return (
    <div className="rounded-full shrink-0 flex items-center justify-center text-white font-medium text-xs"
      style={{ width: size, height: size, background: "var(--color-accent, #4f46e5)" }}>
      {initials}
    </div>
  )
}

export default function AdminGroupsPage() {
  const [tab, setTab] = useState<Tab>("COMMITTEE")
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [staff, setStaff] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)

  // Committee editing
  const [saving, setSaving] = useState<string | null>(null)

  // Group management
  const [activeGroupType, setActiveGroupType] = useState<GroupType>("FORM_CLASS")
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showManageMembers, setShowManageMembers] = useState(false)
  const [newGroup, setNewGroup] = useState({ name: "", type: "FORM_CLASS" as GroupType, description: "", homeroomTeacherId: "", teacherId: "" })
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function load() {
    setLoading(true)
    const [uRes, gRes, cRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/groups"),
      fetch("/api/classes"),
    ])
    if (uRes.ok) {
      const users = await uRes.json()
      setTeachers(users.filter((u: { role: string }) => u.role === "TEACHER"))
      setStaff(users.filter((u: { role: string }) => u.role === "TEACHER" || u.role === "ADMIN"))
      setStudents(users.filter((u: { role: string }) => u.role === "STUDENT"))
    }

    let allGroups: any[] = []
    if (gRes.ok) allGroups = [...await gRes.json()]
    if (cRes.ok) {
      const classes = await cRes.json()
      // Map classes to look like groups and categorize them
      const classGroups = classes.map((c: any) => {
        // Simple logic: names like "4A", "1B" are FORM_CLASS
        const isFormClass = /^[1-6][A-Z]$/.test(c.name)
        return {
          id: c.id,
          name: c.name,
          type: isFormClass ? "FORM_CLASS" : "SUBJECT_CLASS",
          isClass: true,
          classCode: c.classCode,
          homeroomTeacher: c.homeroomTeacher ?? null,
          _count: { members: c._count?.enrollments ?? 0 }
        }
      })
      allGroups = [...allGroups, ...classGroups]
    }
    setGroups(allGroups)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createGroup() {
    if (!newGroup.name.trim()) return

    // If it's a class type, we create a Class to ensure sync with points/missions
    const isClassType = newGroup.type === "FORM_CLASS" || newGroup.type === "SUBJECT_CLASS"
    const endpoint = isClassType ? "/api/classes" : "/api/admin/groups"

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newGroup.name,
        ...(isClassType
          ? { homeroomTeacherId: newGroup.homeroomTeacherId || undefined }
          : { type: newGroup.type, description: newGroup.description, teacherId: newGroup.teacherId || undefined })
      }),
    })

    if (res.ok) {
      const result = await res.json()
      if (isClassType) {
        setGroups((prev) => [...prev, {
          id: result.id,
          name: result.name,
          type: newGroup.type,
          description: null, // Ensure Group type consistency
          isClass: true,
          classCode: result.classCode,
          homeroomTeacher: result.homeroomTeacher ?? null,
          _count: { members: 0 }
        }])
      } else {
        setGroups((prev) => [...prev, { ...result, _count: { members: 0 } }])
      }
      setNewGroup({ name: "", type: newGroup.type, description: "", homeroomTeacherId: "", teacherId: "" })
      setShowCreateGroup(false)
      showToast(isClassType ? "班別已建立（具備積點與任務功能）" : "群組已建立")
    } else {
      showToast("建立失敗，請重試")
    }
  }

  async function deleteGroup(group: any) {
    if (!confirm(`確定刪除「${group.name}」？\n注意：這會移除所有成員關係。`)) return
    const endpoint = group.isClass ? `/api/classes/${group.id}` : `/api/admin/groups/${group.id}`
    const res = await fetch(endpoint, { method: "DELETE" })
    if (res.status === 204 || res.ok) {
      setGroups((prev) => prev.filter((g) => g.id !== group.id))
      if (selectedGroup?.id === group.id) setSelectedGroup(null)
      showToast("已刪除")
    }
  }

  async function openManageMembers(group: any) {
    if (group.isClass) {
      const [memRes, clsRes] = await Promise.all([
        fetch(`/api/classes/${group.id}/members`),
        fetch(`/api/classes/${group.id}`),
      ])
      if (memRes.ok) {
        const members = await memRes.json()
        const cls = clsRes.ok ? await clsRes.json() : null
        setSelectedGroup({
          ...group,
          homeroomTeacher: cls?.homeroomTeacher ?? null,
          members: members.map((m: any) => ({
            id: m.id,
            user: m.student
          }))
        })
        setShowManageMembers(true)
      }
    } else {
      const res = await fetch(`/api/admin/groups/${group.id}`)
      if (res.ok) {
        setSelectedGroup(await res.json())
        setShowManageMembers(true)
      }
    }
  }

  async function addMember(userId: string) {
    if (!selectedGroup) return
    const endpoint = selectedGroup.isClass
      ? `/api/classes/${selectedGroup.id}/members`
      : `/api/admin/groups/${selectedGroup.id}/members`

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      const result = await res.json()
      const newUser = selectedGroup.isClass ? result.student : result.user
      setSelectedGroup((prev: any) => prev ? {
        ...prev,
        members: [...prev.members, { id: result.id, user: newUser }]
      } : null)
      setGroups((prev) => prev.map((g) => g.id === selectedGroup.id ? { ...g, _count: { members: g._count.members + 1 } } : g))
    }
  }

  async function removeMember(userId: string) {
    if (!selectedGroup) return
    const endpoint = selectedGroup.isClass
      ? `/api/classes/${selectedGroup.id}/members?userId=${userId}`
      : `/api/admin/groups/${selectedGroup.id}/members?userId=${userId}`

    const res = await fetch(endpoint, { method: "DELETE" })
    if (res.status === 204 || res.ok) {
      setSelectedGroup((prev: any) => prev ? { ...prev, members: prev.members.filter((m: any) => m.user.id !== userId) } : null)
      setGroups((prev) => prev.map((g) => g.id === selectedGroup.id ? { ...g, _count: { members: g._count.members - 1 } } : g))
    }
  }

  async function setHomeroom(teacherId: string | null) {
    if (!selectedGroup?.isClass) return
    const res = await fetch(`/api/classes/${selectedGroup.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeroomTeacherId: teacherId }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSelectedGroup((prev: any) => prev ? { ...prev, homeroomTeacher: updated.homeroomTeacher ?? null } : prev)
      showToast(teacherId ? "已指派班主任" : "已清除班主任")
    } else {
      showToast("更新失敗，請重試")
    }
  }

  async function setGroupTeacher(teacherId: string | null) {
    if (!selectedGroup || selectedGroup.isClass) return
    const res = await fetch(`/api/admin/groups/${selectedGroup.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSelectedGroup((prev: any) => prev ? { ...prev, teacher: updated.teacher ?? null } : prev)
      showToast(teacherId ? "已指派負責老師" : "已清除負責老師")
    } else {
      showToast("更新失敗，請重試")
    }
  }

  async function addToCommittee(userId: string, committee: CommitteeType, isChair: boolean) {
    setSaving(`${userId}-${committee}`)
    const res = await fetch("/api/admin/committee-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, committee, isChair }),
    })
    if (res.ok) {
      setTeachers((prev) => prev.map((t) =>
        t.id === userId
          ? { ...t, committeeRoles: [...t.committeeRoles, { committee, isChair }] }
          : t
      ))
      showToast("已新增")
    }
    setSaving(null)
  }

  async function removeFromCommittee(userId: string, committee: CommitteeType) {
    setSaving(`${userId}-${committee}`)
    const res = await fetch(`/api/admin/committee-roles?userId=${userId}&committee=${committee}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setTeachers((prev) => prev.map((t) =>
        t.id === userId
          ? { ...t, committeeRoles: t.committeeRoles.filter((r) => r.committee !== committee) }
          : t
      ))
      showToast("已移除")
    }
    setSaving(null)
  }

  const filteredGroups = groups.filter((g) => g.type === activeGroupType)
  const COMMITTEES: CommitteeType[] = ["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50">
          {toast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-h1">群組管理</h1>
        <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          管理委員會成員及班級分組
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "var(--color-border)" }}>
        {(["COMMITTEE", "STUDENT_GROUPS"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-current"
                : "border-transparent"
            }`}
            style={{ color: tab === t ? "var(--color-accent)" : "var(--color-ink-500)", borderBottomColor: tab === t ? "var(--color-accent)" : "transparent" }}
          >
            {t === "COMMITTEE" ? "委員會成員" : "班級分組"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
      ) : tab === "COMMITTEE" ? (
        /* ── Committee Members Tab ── */
        <div className="space-y-3">
          <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
            點擊委員會標籤以新增或移除成員；可在「用戶管理」頁面更改主席狀態。
          </p>
          {teachers.length === 0 && (
            <p className="text-body" style={{ color: "var(--color-ink-300)" }}>暫無教職員</p>
          )}
          {COMMITTEES.map((committee) => {
            const committeeMembers = teachers.filter((t) =>
              t.committeeRoles.some((r) => r.committee === committee)
            )
            return (
              <div key={committee} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-caption px-2 py-0.5 rounded-full border font-medium ${COMMITTEE_COLORS[committee]}`}>
                      {COMMITTEE_LABELS[committee]}
                    </span>
                    <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                      {committeeMembers.length} 人
                    </span>
                  </div>
                </div>

                {/* Current members */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {committeeMembers.map((t) => {
                    const role = t.committeeRoles.find((r) => r.committee === committee)
                    return (
                      <div key={t.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm"
                        style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
                        <Avatar name={t.name} image={t.image} size={20} />
                        <span style={{ color: "var(--color-ink-700)" }}>{t.name ?? t.email}</span>
                        {role?.isChair && <span className="text-xs" style={{ color: "var(--color-accent)" }}>★</span>}
                        <button
                          onClick={() => removeFromCommittee(t.id, committee)}
                          disabled={saving === `${t.id}-${committee}`}
                          className="ml-1 text-xs leading-none opacity-40 hover:opacity-100 transition-opacity"
                          style={{ color: "var(--color-ink-500)" }}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                  {committeeMembers.length === 0 && (
                    <span className="text-caption italic" style={{ color: "var(--color-ink-300)" }}>尚無成員</span>
                  )}
                </div>

                {/* Add member dropdown */}
                <select
                  defaultValue=""
                  className="text-caption px-2 py-1.5 rounded-input border"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-ink-600)" }}
                  onChange={(e) => {
                    const id = e.target.value
                    if (id) { addToCommittee(id, committee, false); e.target.value = "" }
                  }}
                >
                  <option value="">+ 新增成員…</option>
                  {teachers
                    .filter((t) => !t.committeeRoles.some((r) => r.committee === committee))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name ?? t.email}</option>
                    ))
                  }
                </select>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── Student Groups Tab ── */
        <div>
          {/* Group type switcher */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {(["FORM_CLASS", "SUBJECT_CLASS", "SPECIFIC"] as GroupType[]).map((type) => (
              <button
                key={type}
                onClick={() => { setActiveGroupType(type); setShowCreateGroup(false) }}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  activeGroupType === type
                    ? GROUP_TYPE_COLORS[type]
                    : "border-gray-200 text-gray-500 bg-white"
                }`}
              >
                {GROUP_TYPE_LABELS[type]}
                <span className="ml-1.5 text-xs opacity-60">
                  {groups.filter((g) => g.type === type).length}
                </span>
              </button>
            ))}
          </div>

          {/* Group list */}
          <div className="space-y-2 mb-4">
            {filteredGroups.length === 0 && !showCreateGroup && (
              <p className="text-body py-4" style={{ color: "var(--color-ink-300)" }}>
                尚無{GROUP_TYPE_LABELS[activeGroupType]}群組
              </p>
            )}
            {filteredGroups.map((group) => (
              <div key={group.id} className="card px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                      {group.name}
                    </p>
                    <span className={`text-caption px-2 py-0.5 rounded-full border ${GROUP_TYPE_COLORS[group.type as GroupType]}`}>
                      {GROUP_TYPE_LABELS[group.type as GroupType]}
                    </span>
                    {group.isClass && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-100 font-bold">
                        具備積點與任務
                      </span>
                    )}
                  </div>
                  {group.isClass ? (
                    <p className="text-caption mt-0.5 font-mono" style={{ color: "var(--color-ink-400)" }}>
                      課程代碼: {group.classCode}
                    </p>
                  ) : group.description ? (
                    <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                      {group.description}
                    </p>
                  ) : null}
                  <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                    {group._count.members} 位成員
                    {group.isClass && group.homeroomTeacher && (
                      <span className="ml-2" style={{ color: "var(--color-accent)" }}>
                        · 班主任：{group.homeroomTeacher.name ?? group.homeroomTeacher.email}
                      </span>
                    )}
                    {!group.isClass && group.teacher && (
                      <span className="ml-2" style={{ color: "var(--color-accent)" }}>
                        · 負責老師：{group.teacher.name ?? group.teacher.email}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openManageMembers(group)}
                    className="text-caption px-3 py-1.5 rounded-input border"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-accent)" }}
                  >
                    管理成員
                  </button>
                  <button
                    onClick={() => deleteGroup(group)}
                    className="p-1.5 opacity-40 hover:opacity-100 transition-opacity"
                    style={{ color: "var(--color-discipline, #dc2626)" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Create group form */}
          {showCreateGroup ? (
            <div className="card p-4 space-y-3">
              <h3 className="text-body font-semibold">新增{GROUP_TYPE_LABELS[activeGroupType]}</h3>
              <input
                value={newGroup.name}
                onChange={(e) => setNewGroup((v) => ({ ...v, name: e.target.value }))}
                placeholder={`群組名稱（例：${activeGroupType === "FORM_CLASS" ? "4A" : activeGroupType === "SUBJECT_CLASS" ? "ICT 4A" : "游泳隊"}）`}
                className="w-full border rounded-input px-3 py-2 text-body"
                style={{ borderColor: "var(--color-border)" }}
              />
              {(activeGroupType === "FORM_CLASS" || activeGroupType === "SUBJECT_CLASS") ? (
                <StaffPicker
                  staff={staff}
                  selectedId={newGroup.homeroomTeacherId}
                  onSelect={(id) => setNewGroup((v) => ({ ...v, homeroomTeacherId: id }))}
                  placeholder="指派班主任"
                  emptyHint="點擊從教職員中選擇"
                  badge="班主任"
                />
              ) : (
                <div className="space-y-3">
                  <input
                    value={newGroup.description}
                    onChange={(e) => setNewGroup((v) => ({ ...v, description: e.target.value }))}
                    placeholder="備注說明（選填）"
                    className="w-full border rounded-input px-3 py-2 text-body"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                  <StaffPicker
                    staff={staff}
                    selectedId={newGroup.teacherId}
                    onSelect={(id) => setNewGroup((v) => ({ ...v, teacherId: id }))}
                    placeholder="指派負責老師"
                    emptyHint="點擊從教職員中選擇"
                    badge="負責老師"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setShowCreateGroup(false)} className="flex-1 py-2 rounded-input border text-sm" style={{ borderColor: "var(--color-border)" }}>
                  取消
                </button>
                <button
                  onClick={createGroup}
                  disabled={!newGroup.name.trim()}
                  className="flex-1 py-2 rounded-input text-sm text-white disabled:opacity-50"
                  style={{ background: "var(--color-accent, #4f46e5)" }}
                >
                  建立
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowCreateGroup(true); setNewGroup((v) => ({ ...v, type: activeGroupType })) }}
              className="w-full py-2.5 rounded-input border-2 border-dashed text-sm transition-colors hover:bg-gray-50"
              style={{ borderColor: "var(--color-border)", color: "var(--color-ink-400)" }}
            >
              + 新增{GROUP_TYPE_LABELS[activeGroupType]}
            </button>
          )}
        </div>
      )}

      {/* Manage Members Modal */}
      {showManageMembers && selectedGroup && (
        <ManageMembersModal
          group={selectedGroup}
          allStudents={students}
          allStaff={staff}
          onClose={() => { setShowManageMembers(false); setSelectedGroup(null) }}
          onAdd={addMember}
          onRemove={removeMember}
          onSetHomeroom={setHomeroom}
          onSetGroupTeacher={setGroupTeacher}
        />
      )}
    </div>
  )
}

function ManageMembersModal({
  group, allStudents, allStaff, onClose, onAdd, onRemove, onSetHomeroom, onSetGroupTeacher,
}: {
  group: GroupDetail
  allStudents: Student[]
  allStaff: Teacher[]
  onClose: () => void
  onAdd: (userId: string) => Promise<void>
  onRemove: (userId: string) => Promise<void>
  onSetHomeroom: (teacherId: string | null) => Promise<void>
  onSetGroupTeacher: (teacherId: string | null) => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const memberIds = new Set(group.members.map((m) => m.user.id))
  const nonMembers = allStudents.filter(
    (s) => !memberIds.has(s.id) && (
      !search || (s.name ?? "").includes(search) || (s.email ?? "").includes(search)
    )
  )

  async function handleAdd(userId: string) {
    setBusy(userId)
    await onAdd(userId)
    setBusy(null)
  }

  async function handleRemove(userId: string) {
    setBusy(userId)
    await onRemove(userId)
    setBusy(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-h2">{group.name} — 成員管理</h3>
            <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
              {GROUP_TYPE_LABELS[group.type]} · {group.members.length} 位成員
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md" style={{ color: "var(--color-ink-400)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 班主任（僅 Class-backed 班別；每班一位） */}
          {group.isClass && (
            <div>
              <p className="text-caption font-medium mb-2" style={{ color: "var(--color-ink-500)" }}>
                班主任
              </p>
              <StaffPicker
                staff={allStaff}
                selectedId={group.homeroomTeacher?.id ?? ""}
                onSelect={(id) => onSetHomeroom(id || null)}
                badge="班主任"
              />
            </div>
          )}

          {/* 負責老師（非 Class 群組） */}
          {!group.isClass && (
            <div>
              <p className="text-caption font-medium mb-2" style={{ color: "var(--color-ink-500)" }}>
                負責老師
              </p>
              <StaffPicker
                staff={allStaff}
                selectedId={group.teacher?.id ?? ""}
                onSelect={(id) => onSetGroupTeacher(id || null)}
                badge="負責老師"
              />
            </div>
          )}

          {/* Current members */}
          <div>
            <p className="text-caption font-medium mb-2" style={{ color: "var(--color-ink-500)" }}>
              現有成員 ({group.members.length})
            </p>
            {group.members.length === 0 ? (
              <p className="text-caption italic" style={{ color: "var(--color-ink-300)" }}>尚無成員</p>
            ) : (
              <div className="space-y-1.5">
                {group.members.map((m) => (
                  <div key={m.user.id} className="flex items-center gap-2.5 p-2 rounded-lg"
                    style={{ background: "var(--color-surface-2, #f9fafb)" }}>
                    <Avatar name={m.user.name} image={m.user.image} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-body" style={{ color: "var(--color-ink-800)" }}>{m.user.name ?? "—"}</p>
                      <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>{m.user.email}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(m.user.id)}
                      disabled={busy === m.user.id}
                      className="text-caption px-2 py-1 rounded border opacity-60 hover:opacity-100 transition-opacity"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-discipline, #dc2626)" }}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add students */}
          <div>
            <p className="text-caption font-medium mb-2" style={{ color: "var(--color-ink-500)" }}>
              新增學生
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名或電郵…"
              className="w-full border rounded-input px-3 py-2 text-body mb-2"
              style={{ borderColor: "var(--color-border)" }}
            />
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {nonMembers.length === 0 ? (
                <p className="text-caption italic" style={{ color: "var(--color-ink-300)" }}>
                  {search ? "找不到相符學生" : "所有學生已在群組中"}
                </p>
              ) : (
                nonMembers.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 p-2 rounded-lg">
                    <Avatar name={s.name} image={s.image} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-body" style={{ color: "var(--color-ink-800)" }}>{s.name ?? "—"}</p>
                      <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>{s.email}</p>
                    </div>
                    <button
                      onClick={() => handleAdd(s.id)}
                      disabled={busy === s.id}
                      className="text-caption px-2 py-1 rounded border transition-colors"
                      style={{ borderColor: "var(--color-accent, #4f46e5)", color: "var(--color-accent, #4f46e5)" }}
                    >
                      {busy === s.id ? "…" : "+ 加入"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
