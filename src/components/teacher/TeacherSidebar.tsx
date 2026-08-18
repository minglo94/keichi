"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ComponentType } from "react"
import { signOut } from "next-auth/react"
import Image from "next/image"
import { NotificationBell } from "@/components/teacher/NotificationBell"

type User = {
  name?: string | null
  email?: string | null
  image?: string | null
  role?: string | null
}

type NavItem = { href: string; label: string; icon: ComponentType<{ color?: string }>; hidden?: boolean }

const MAIN_NAV: NavItem[] = [
  { href: "/teacher",               label: "主頁",     icon: HomeIcon       },
  { href: "/teacher/todos",         label: "待辦事項", icon: CheckIcon      },
  { href: "/teacher/announcements", label: "公告",     icon: MegaphoneIcon, hidden: true },
  { href: "/teacher/calendar",      label: "行事曆",   icon: CalendarIcon   },
  { href: "/teacher/activities",    label: "活動管理", icon: ActivityIcon,  hidden: true },
  { href: "/teacher/missions",      label: "任務管理", icon: ClipboardIcon, hidden: true },
  { href: "/teacher/points",        label: "積點",     icon: StarIcon,      hidden: true },
  { href: "/teacher/agents",        label: "AI 助理",  icon: AgentIcon      },
]

const COMMITTEE_NAV = [
  { href: "/teacher/committee/admin",      label: "行政",     icon: BriefcaseIcon, color: "var(--color-admin)"      },
  { href: "/teacher/committee/discipline", label: "訓育",     icon: ShieldIcon,    color: "var(--color-discipline)" },
  { href: "/teacher/committee/it",         label: "資訊科技", icon: MonitorIcon,   color: "var(--color-it)"         },
  { href: "/teacher/committee/curriculum", label: "課程發展", icon: BookIcon,      color: "var(--color-curriculum)" },
  { href: "/teacher/committee/eca",        label: "課外活動", icon: ActivityIcon,  color: "var(--color-eca)"        },
]

const ADMIN_NAV: NavItem[] = [
  { href: "/teacher/admin/users",    label: "用戶管理", icon: UsersIcon  },
  { href: "/teacher/admin/groups",   label: "群組管理", icon: GroupsIcon },
  { href: "/teacher/admin/agents",   label: "AI 助理管理", icon: AgentIcon },
  { href: "/teacher/admin/audit",    label: "操作紀錄", icon: AuditIcon  },
  { href: "/teacher/admin/settings", label: "系統設定", icon: SettingsIcon },
]

export function TeacherSidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  function isActive(href: string) {
    if (href === "/teacher") return pathname === "/teacher"
    return pathname.startsWith(href)
  }

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  const sidebarContent = (
    <aside
      className="flex flex-col h-full"
      style={{ background: "var(--color-surface)", borderRight: "1px solid var(--color-border)" }}
    >
      {/* Logo — replace /logo-placeholder.svg with your actual logo */}
      <div className="px-5 pt-6 pb-4 flex items-center gap-2.5">
        <Image
          src="/logo.png"
          alt="基智行政平台 Logo"
          width={32}
          height={32}
          priority
        />
        <div className="flex items-end gap-1.5">
          <span className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink-900)" }}>
            基智行政平台
          </span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="px-3 flex-1 overflow-y-auto">
        <p className="px-3 mb-1 text-caption" style={{ color: "var(--color-ink-300)" }}>
          導覽 · MENU
        </p>
        <ul className="space-y-0.5">
          {MAIN_NAV.filter((n) => !n.hidden).map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className={`nav-item ${isActive(href) ? "active" : ""}`}
              >
                <Icon />
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Committees */}
        <p className="px-3 mt-5 mb-1 text-caption" style={{ color: "var(--color-ink-300)" }}>
          各組 · COMMITTEES
        </p>
        <ul className="space-y-0.5">
          {COMMITTEE_NAV.map(({ href, label, icon: Icon, color }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className={`nav-item ${isActive(href) ? "active" : ""}`}
              >
                <Icon color={isActive(href) ? "var(--color-accent)" : color} />
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Admin — only visible to ADMIN role */}
        {user.role === "ADMIN" && (
          <>
            <p className="px-3 mt-5 mb-1 text-caption" style={{ color: "var(--color-ink-300)" }}>
              管理 · ADMIN
            </p>
            <ul className="space-y-0.5">
              {ADMIN_NAV.filter((n) => !n.hidden).map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`nav-item ${isActive(href) ? "active" : ""}`}
                  >
                    <Icon />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* User footer */}
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? ""}
            className="w-8 h-8 rounded-full shrink-0 object-cover"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-body font-medium truncate" style={{ color: "var(--color-ink-900)" }}>
            {user.name ?? user.email ?? "老師"}
          </p>
          <p className="text-caption truncate" style={{ color: "var(--color-ink-500)" }}>
            {user.role === "ADMIN" ? "管理員" : "老師"}
          </p>
        </div>
        <NotificationBell />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="登出"
          className="shrink-0 p-1 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
          style={{ color: "var(--color-ink-500)" }}
        >
          <LogOutIcon />
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar — fixed */}
      <div className="hidden md:block fixed left-0 top-0 h-full w-[220px] z-30">
        {sidebarContent}
      </div>

      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center px-4 gap-3"
        style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-md"
          style={{ color: "var(--color-ink-700)" }}
          aria-label="開啟選單"
        >
          <MenuIcon />
        </button>
        <Image
          src="/logo-placeholder.svg"
          alt="基智行政平台 Logo"
          width={24}
          height={24}
        />
        <span className="font-semibold text-base" style={{ color: "var(--color-ink-900)" }}>
          基智行政平台
        </span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          {/* Drawer panel */}
          <div className="relative w-[220px] h-full z-50">
            {sidebarContent}
          </div>
          {/* Close button in drawer */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-3 left-[228px] p-1.5 rounded-md bg-white z-50"
            aria-label="關閉選單"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </>
  )
}

/* ── Inline SVG icons (no external dependency) ── */

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function MegaphoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function BriefcaseIcon({ color }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )
}

function ShieldIcon({ color }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function MonitorIcon({ color }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

function BookIcon({ color }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6"  x2="6"  y2="18" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 11l-4 4-2-2" />
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function GroupsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      <path d="M22 20c0-3.3-2.1-6-5-6" />
    </svg>
  )
}

function AgentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
      <circle cx="9" cy="13" r="1" fill="currentColor"/>
      <circle cx="15" cy="13" r="1" fill="currentColor"/>
    </svg>
  )
}

function AuditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/>
      <path d="M9 13h6M9 17h4"/>
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

