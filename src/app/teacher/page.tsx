import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { DashboardGreeting } from "@/components/teacher/DashboardGreeting"
import { MiniCalendar } from "@/components/teacher/MiniCalendar"
import { CommitteeToolsGrid } from "@/components/teacher/CommitteeToolsGrid"
import { FavoriteToolsGrid } from "@/components/teacher/FavoriteToolsGrid"
import { DashboardAnnouncements } from "@/components/DashboardAnnouncements"
import { UnifiedTimeline } from "@/components/UnifiedTimeline"

export default async function TeacherDashboard() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const now      = new Date()
  const nextWeek = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const upcomingTodos = await prisma.todo.findMany({
    where: {
      OR: [
        { createdById: session.user.id },
        { assignees: { some: { userId: session.user.id } } },
      ],
      status: { not: "DONE" },
    },
    orderBy: [{ dueDate: "asc" }],
    take: 10,
  })

  const overdueTodos = upcomingTodos.filter(
    (t) => t.dueDate && t.dueDate < now
  )
  const todayTodos = upcomingTodos.filter(
    (t) => t.dueDate && t.dueDate <= new Date(now.getTime() + 24*60*60*1000)
  )

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [calEvents, allEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startDate: { gte: monthStart, lt: monthEnd } },
      select: { id: true, startDate: true, title: true, committee: true },
    }),
    prisma.calendarEvent.findMany({
      where: { startDate: { gte: now, lt: nextWeek } },
      orderBy: { startDate: "asc" },
      take: 10,
    })
  ])

  // Map to Timeline items
  const timelineItems: any[] = [
    ...upcomingTodos.map(t => ({
      id: t.id,
      type: "TODO",
      title: t.title,
      date: t.dueDate?.toISOString() ?? now.toISOString(),
      committee: t.committee,
    })),
    ...allEvents.map(e => ({
      id: e.id,
      type: "EVENT",
      title: e.title,
      date: e.startDate.toISOString(),
      committee: e.committee,
    }))
  ]

  const serializedTodos = upcomingTodos.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate?.toISOString() ?? null,
    status: t.status,
  }))

  const serializedCalendar = calEvents.map((ev) => ({
    id: ev.id,
    startDate: ev.startDate.toISOString(),
    title: ev.title,
    committee: ev.committee as any,
  }))

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <DashboardGreeting
        name={session.user.name}
        urgentCount={overdueTodos.length}
        todayCount={todayTodos.length}
      />

      <DashboardAnnouncements />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <UnifiedTimeline initialItems={timelineItems} />
        <MiniCalendar todos={serializedTodos} calendarEvents={serializedCalendar} />
      </div>

      <FavoriteToolsGrid />

      <CommitteeToolsGrid />
    </div>
  )
}
