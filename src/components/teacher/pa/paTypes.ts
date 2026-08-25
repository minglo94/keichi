// Shared types + helpers for the PA-announcement (宣佈訊息) module.

export type Priority      = "NORMAL" | "IMPORTANT" | "URGENT"
export type Status        = "DRAFT" | "PUBLISHED" | "ARCHIVED"
export type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"

export type Category = { id: string; name: string; committee: CommitteeType | null }

export type PAAnnouncement = {
  id:        string
  title:     string
  body:      string
  priority:  Priority
  status:    Status
  pinned:    boolean
  publishAt: string
  createdAt: string
  category:  Category | null
  author:    { id: string; name: string | null; image: string | null }
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  NORMAL:    "普通",
  IMPORTANT: "重要",
  URGENT:    "緊急",
}

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT:     "草稿",
  PUBLISHED: "已發佈",
  ARCHIVED:  "封存",
}

// Users are in Hong Kong time, so local date methods give the HKT calendar day.
export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function todayKey(): string {
  return dayKey(new Date().toISOString())
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// Start-of-week (Monday) key for the week containing `iso`.
export function isThisWeek(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  const monday = new Date(now)
  const dow = (now.getDay() + 6) % 7 // 0 = Monday
  monday.setDate(now.getDate() - dow)
  monday.setHours(0, 0, 0, 0)
  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000)
  return d >= monday && d < nextMonday
}

export function isThisMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

// wa.me share link with the announcement formatted for PA readout.
export function waShareUrl(a: PAAnnouncement): string {
  const tag  = a.category?.name ? `【${a.category.name}】` : ""
  const text = `${tag}${a.title}\n${a.body}\n\n(${formatDate(a.publishAt)})`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
