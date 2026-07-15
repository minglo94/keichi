import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import bcrypt from "bcryptjs"
import type { Role } from "@prisma/client"
import type { Adapter } from "next-auth/adapters"

// Bootstrap admins: these emails are always granted ADMIN on login (handy for
// Google Workspace SSO where accounts are created on first sign-in). Add more
// via the ADMIN_EMAILS env var (comma-separated); the default is always kept.
const ADMIN_EMAILS = new Set(
  ["test2020@ga.keichi.edu.hk", ...(process.env.ADMIN_EMAILS ?? "").split(",")]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

function isBootstrapAdmin(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase())
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  trustHost: true,
  session: { 
    strategy: "jwt",
    maxAge: 2 * 60 * 60, // 2 hours
  },
  providers: [
    Google({
      clientId:  process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "帳號密碼",
      credentials: {
        email:    { label: "電郵", type: "email" },
        password: { label: "密碼", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string

        // Throttle credential brute-force: max 10 attempts per email / 15 min.
        const rl = await checkRateLimit(`login:${email.toLowerCase()}`, 10, 15 * 60 * 1000)
        if (!rl.allowed) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.password) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        )
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role }
      },
    }),
  ],
  cookies: {
    pkceCodeVerifier: {
      name: "authjs.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 15,
      },
    },
    state: {
      name: "authjs.state",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 15,
      },
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      // Credentials provider — always allow
      if (!account || account.provider === "credentials") return true

      // For Google (or any OAuth provider): if a user with this email already
      // exists but has no linked OAuth account, create the link now.
      // This handles users created via CSV import, seed, or password sign-up.
      if (user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        })
        if (existing) {
          const linked = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
          })
          if (!linked) {
            await prisma.account.create({
              data: {
                userId:            existing.id,
                type:              account.type,
                provider:          account.provider,
                providerAccountId: account.providerAccountId,
                access_token:      account.access_token,
                expires_at:        account.expires_at,
                token_type:        account.token_type,
                scope:             account.scope,
                id_token:          account.id_token,
                refresh_token:     account.refresh_token ?? null,
              },
            })
          }
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id   = user.id
        let role   = (user as { role: Role }).role
        // Bootstrap allowlist wins — force ADMIN and promote the DB row so
        // other queries (which read User.role) see it too.
        if (isBootstrapAdmin((user as { email?: string | null }).email)) {
          role = "ADMIN"
          if ((user as { role: Role }).role !== "ADMIN" && user.id) {
            await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } }).catch(() => {})
          }
        }
        token.role = role
      }
      if (account?.provider === "google") {
        token.accessToken = account.access_token
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id   = token.id as string
        session.user.role = token.role as Role
        session.accessToken = token.accessToken as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
