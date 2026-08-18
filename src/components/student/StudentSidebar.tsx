"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type ComponentType } from "react"
import { signOut } from "next-auth/react"
import Image from "next/image"

type User = {
  name?:  string | null
  email?: string | null
  image?: string | null
}

type NavItem = { href: string; label: string; icon: ComponentType<{ color?: string }>; hidden?: boolean }

const NAV: NavItem[] = [
  { href: "/student",            label: "主頁",     icon: HomeIcon      },
  { href: "/student/activities", label: "我的活動", icon: CalendarIcon, hidden: true },
  { href: "/student/calendar",   label: "行事曆",   icon: GridIcon      },
  { href: "/student/missions",   label: "任務",     icon: MapIcon,      hidden: true },
  { href: "/student/flashcards", label: "閃卡",     icon: CardIcon      },
  { href: "/student/points",     label: "積點",     icon: StarIcon,     hidden: true },
  { href: "/student/records",    label: "行為記錄", icon: RecordIcon    },
]

export function StudentSidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  function isActive(href: string) {
    if (href === "/student") return pathname === "/student"
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
      <div className="px-5 pt-6 pb-4 flex items-center gap-2.5">
        <Image src="/logo-placeholder.svg" alt="基智行政平台 Logo" width={32} height={32} priority />
        <div className="flex items-end gap-1.5">
          <span className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink-900)" }}>
            基智行政平台
          </span>
        </div>
      </div>

      <nav className="px-3 flex-1 overflow-y-auto">
        <p className="px-3 mb-1 text-caption" style={{ color: "var(--color-ink-300)" }}>
          導覽 · MENU
        </p>
        <ul className="space-y-0.5">
          {NAV.filter((n) => !n.hidden).map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={`nav-item flex items-center gap-3 px-3 py-2 rounded-input text-body transition-colors${isActive(href) ? " active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <Icon />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" width={32} height={32} className="rounded-full shrink-0" />
          ) : (
            <div
              className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white font-semibold text-caption"
              style={{ background: "var(--color-accent)" }}
            >
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-caption font-medium truncate" style={{ color: "var(--color-ink-900)" }}>
              {user.name ?? user.email}
            </p>
            <p className="text-[10px] truncate" style={{ color: "var(--color-ink-400)" }}>學生</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-caption shrink-0 hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-ink-400)" }}
            title="登出"
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block fixed top-0 left-0 h-full w-[220px] z-30">
        {sidebarContent}
      </div>

      {/* Mobile: top bar + drawer */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}
      >
        <button onClick={() => setOpen((v) => !v)} className="p-1.5 rounded-input"
          style={{ color: "var(--color-ink-700)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Image src="/logo.png" alt="基智行政平台 Logo" width={24} height={24} />
        <span className="text-body font-semibold" style={{ color: "var(--color-ink-900)" }}>基智行政平台</span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-[220px] h-full">{sidebarContent}</div>
          <div className="flex-1 bg-black/30" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}

// ─── Icons ────────────────────────────────────────────────
function HomeIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> }
function CalendarIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> }
function GridIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> }
function MapIcon()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg> }
function CardIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg> }
function StarIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg> }
function RecordIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></svg> }
