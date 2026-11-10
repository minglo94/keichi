import { PrismaClient } from "@prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"
import { makeScopedProxy } from "./staging-prisma-scope.mjs"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
let fallback: PrismaClient | undefined
function defaultClient(): PrismaClient {
  fallback ??= globalForPrisma.prisma || new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = fallback
  return fallback
}
export const prisma = makeScopedProxy(
  (connectionString: string) => new PrismaClient({ adapter: new PrismaNeon({ connectionString }) }),
  defaultClient,
) as PrismaClient
