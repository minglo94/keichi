// ============================================================
// One-off cleanup — delete calendar events before May 2025.
//
// Dry-run by default (lists what would be deleted, deletes nothing).
// Pass --confirm to actually delete.
//
// Usage:
//   pnpm calendar:cleanup:dry       # preview only
//   pnpm calendar:cleanup:confirm   # actually deletes
//
// Env: .env + .env.local are loaded by the npm script (see package.json).
// Run this against the environment whose DATABASE_URL you want to clean —
// there is no confirmation prompt beyond the --confirm flag, so double-check
// which database that env points at before running with --confirm.
// ============================================================
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Delete events starting strictly before this date; May 2025 itself is kept.
const CUTOFF = new Date("2025-05-01T00:00:00Z")

async function main() {
  const toDelete = await prisma.calendarEvent.findMany({
    where:   { startDate: { lt: CUTOFF } },
    select:  { id: true, title: true, startDate: true },
    orderBy: { startDate: "asc" },
  })

  console.log(`Found ${toDelete.length} event(s) before ${CUTOFF.toISOString().slice(0, 10)}:`)
  toDelete.forEach((e) => {
    console.log(`  - ${e.startDate.toISOString().slice(0, 10)}  ${e.title}`)
  })

  if (toDelete.length === 0) {
    console.log("Nothing to delete.")
    return
  }

  if (!process.argv.includes("--confirm")) {
    console.log(`\nDry run only — ${toDelete.length} event(s) listed above would be deleted.`)
    console.log("Re-run with --confirm to actually delete them.")
    return
  }

  const { count } = await prisma.calendarEvent.deleteMany({ where: { startDate: { lt: CUTOFF } } })
  console.log(`\n✅ Deleted ${count} event(s).`)
}

main()
  .catch((err) => {
    console.error("\n❌ Cleanup failed:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
