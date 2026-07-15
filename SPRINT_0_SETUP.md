# AI 大智若愚 — Sprint 0 Setup Guide

## 前置要求
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Zeabur 帳號
- Google Cloud Console 帳號
- Pusher 帳號（免費方案足夠）
- Anthropic API Key

---

## Step 1：初始化 Next.js 專案

```bash
pnpm create next-app@latest dazhi \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd dazhi
```

## Step 2：安裝依賴

```bash
# ORM + Database
pnpm add prisma @prisma/client

# Authentication
pnpm add next-auth@beta @auth/prisma-adapter

# Realtime
pnpm add pusher pusher-js

# AI
pnpm add @anthropic-ai/sdk

# Utilities
pnpm add zod

# Dev only
pnpm add -D @types/node
```

## Step 3：設定 Prisma

```bash
# Copy schema.prisma to prisma/ folder (已提供)
# Then generate client:
npx prisma generate

# Push schema to Zeabur DB (first time):
npx prisma db push

# Or create migration (recommended for production):
npx prisma migrate dev --name init
```

## Step 4：設定 Google OAuth

1. 前往 [Google Cloud Console](https://console.cloud.google.com)
2. 建立新專案 "AI 大智若愚"
3. APIs & Services → Credentials → Create OAuth Client ID
4. Application type: **Web application**
5. Authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://YOUR_APP.zeabur.app`
6. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR_APP.zeabur.app/api/auth/callback/google`
7. 複製 Client ID 和 Client Secret 到 `.env.local`

## Step 5：設定 auth.ts (NextAuth v5)

建立 `src/lib/auth.ts`：

```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      session.user.role = user.role  // Include role in session
      return session
    },
  },
})
```

建立 `src/app/api/auth/[...nextauth]/route.ts`：

```typescript
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

## Step 6：設定 Prisma Client Singleton

建立 `src/lib/prisma.ts`：

```typescript
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

## Step 7：Pusher 認證 Route（私人頻道）

建立 `src/app/api/pusher/auth/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { pusherServer } from "@/lib/pusher"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.text()
  const params = new URLSearchParams(body)
  const socketId = params.get("socket_id")!
  const channelName = params.get("channel_name")!

  // Security: users can only auth their own private channel
  const allowedChannel = `private-user-${session.user.id}`
  if (channelName !== allowedChannel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channelName)
  return NextResponse.json(authResponse)
}
```

## Step 8：部署至 Zeabur

1. Push code to GitHub
2. Zeabur Dashboard → New Project → Deploy from GitHub
3. Add PostgreSQL service to the same project
4. 設定所有環境變數（參考 `.env.example`）
5. `DATABASE_URL` 使用 Zeabur 自動生成的連接字串

---

## 驗證 Sprint 0 完成標準

- [ ] `http://localhost:3000` 正常載入
- [ ] Google 登入流程完整（跳轉 → 授權 → 回到首頁）
- [ ] 登入後 session 包含 `user.id` 和 `user.role`
- [ ] `npx prisma studio` 可看到所有資料表
- [ ] Pusher Debug Console 可看到測試事件

完成後進入 Sprint 1：班級管理功能。
