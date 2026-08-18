# CLAUDE.md — AI 大智若愚 完整建構規格

> 本文件是給 **Claude Code** 的完整執行指引。請由上至下順序執行，每個 Sprint 完成後進行驗證再繼續。

---

## 產品簡介

**AI 大智若愚**是一個香港中學課堂教學平台，整合衝關學習地圖、SM-2 閃卡系統、即時積點廣播，並以 Claude API 驅動 AI 出題與 Prompt Engineering 評分。

**目標用戶**：香港中學 ICT 科老師及學生（每班 36–45 人）

---

## 技術決策（已確定，不可更改）

| 項目 | 決定 | 原因 |
|------|------|------|
| 框架 | Next.js 14 App Router + TypeScript | 全端單 repo，Zeabur 友好 |
| 認證 | NextAuth.js v5 + Google OAuth | 學校 Google Workspace SSO |
| 資料庫 | PostgreSQL + Prisma ORM | Zeabur 原生支援 |
| 即時通訊 | Pusher Channels | 免維護 WebSocket，HK 低延遲 |
| AI 引擎 | Anthropic Claude API | Sonnet 出題，Haiku 評分 |
| 部署 | Zeabur (HK-1 區域) | 學生資料留港，《私隱條例》合規 |
| 樣式 | Tailwind CSS v3 | |
| 驗證 | Zod | |

---

## 專案目錄結構

執行前先建立以下完整結構：

```
dazhi/
├── prisma/
│   └── schema.prisma          # 已提供，直接使用
├── src/
│   ├── types/
│   │   └── mission.ts         # 已提供，直接使用
│   ├── lib/
│   │   ├── prisma.ts          # 建立（見 Sprint 0）
│   │   ├── auth.ts            # 建立（見 Sprint 0）
│   │   ├── pusher.ts          # 已提供，直接使用
│   │   ├── pusher-client.ts   # 建立（見 Sprint 0）
│   │   ├── claude.ts          # 已提供，直接使用
│   │   ├── sm2.ts             # 已提供，直接使用
│   │   └── class-code.ts      # 建立（見 Sprint 1）
│   ├── components/
│   │   ├── ui/                # 共用 UI 元件
│   │   ├── student/           # 學生端元件
│   │   └── teacher/           # 老師端元件
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx            # 首頁（登入入口）
│       ├── api/
│       │   ├── auth/
│       │   │   └── [...nextauth]/route.ts
│       │   ├── pusher/
│       │   │   └── auth/route.ts
│       │   ├── classes/
│       │   │   ├── route.ts
│       │   │   ├── join/route.ts
│       │   │   └── [classId]/
│       │   │       ├── route.ts
│       │   │       ├── missions/route.ts
│       │   │       └── points/route.ts
│       │   ├── missions/
│       │   │   └── [missionId]/
│       │   │       ├── route.ts
│       │   │       └── submit/route.ts
│       │   │       └── submissions/route.ts
│       │   ├── submissions/
│       │   │   └── [subId]/
│       │   │       └── review/route.ts  # 已提供
│       │   ├── flashcard-decks/
│       │   │   ├── route.ts
│       │   │   └── [deckId]/
│       │   │       ├── cards/route.ts
│       │   │       ├── due/route.ts
│       │   │       └── review/route.ts
│       │   └── ai/
│       │       ├── generate-quiz/route.ts
│       │       └── evaluate-prompt/route.ts
│       ├── (auth)/
│       │   └── login/page.tsx
│       ├── student/
│       │   ├── layout.tsx
│       │   ├── page.tsx        # 學生 Dashboard
│       │   ├── missions/page.tsx  # 衝關地圖
│       │   └── flashcards/
│       │       ├── page.tsx
│       │       └── [deckId]/
│       │           ├── page.tsx
│       │           └── review/page.tsx
│       └── teacher/
│           ├── layout.tsx
│           ├── page.tsx        # 老師 Dashboard
│           ├── missions/
│           │   ├── page.tsx    # 任務管理列表
│           │   ├── new/page.tsx
│           │   └── [missionId]/
│           │       ├── page.tsx
│           │       └── submissions/page.tsx
│           └── points/page.tsx # 發點 + 排行榜
├── .env.example               # 已提供
├── .env.local                 # 自行建立，填入真實值
└── CLAUDE.md                  # 本文件
```

---

## 環境變數（.env.local）

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/dazhi?schema=public"
AUTH_SECRET="openssl rand -base64 32 的結果"
AUTH_GOOGLE_ID="YOUR.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="YOUR_SECRET"
PUSHER_APP_ID="your_app_id"
PUSHER_SECRET="your_server_secret"
NEXT_PUBLIC_PUSHER_KEY="your_public_key"
NEXT_PUBLIC_PUSHER_CLUSTER="ap3"
ANTHROPIC_API_KEY="sk-ant-..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Sprint 0 — 基礎設施

### 安裝依賴

```bash
pnpm create next-app@latest dazhi --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd dazhi

pnpm add prisma @prisma/client
pnpm add next-auth@beta @auth/prisma-adapter
pnpm add pusher pusher-js
pnpm add @anthropic-ai/sdk
pnpm add zod
pnpm add -D @types/node
```

### 建立 `src/lib/prisma.ts`

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

### 建立 `src/lib/auth.ts`

```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import type { Role } from "@prisma/client"

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
      session.user.role = user.role as Role
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
```

### 建立 `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

### 建立 `src/app/api/pusher/auth/route.ts`

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

  // Security: users can only subscribe to their own private channel
  const allowedChannel = `private-user-${session.user.id}`
  if (channelName !== allowedChannel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channelName)
  return NextResponse.json(authResponse)
}
```

### 建立 `src/lib/pusher-client.ts`

```typescript
import Pusher from "pusher-js"

let pusherClient: Pusher | null = null

export function getPusherClient(): Pusher {
  if (!pusherClient) {
    pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "/api/pusher/auth",
    })
  }
  return pusherClient
}
```

### 初始化資料庫

```bash
# 複製已提供的 schema.prisma 至 prisma/
npx prisma generate
npx prisma db push   # 首次建表
```

### 擴展 NextAuth Session 類型

建立 `src/types/next-auth.d.ts`：

```typescript
import type { Role } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
  interface User {
    role: Role
  }
}
```

### Sprint 0 完成驗證

- [ ] `pnpm dev` 無錯誤
- [ ] `http://localhost:3000` 載入正常
- [ ] Google 登入完整流程可跑通
- [ ] `npx prisma studio` 可見所有 12 張資料表

---

## Sprint 1 — 班級管理

### 建立 `src/lib/class-code.ts`

```typescript
// Generate unique 6-char alphanumeric class code
export function generateClassCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Exclude ambiguous chars
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
```

### API：`src/app/api/classes/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateClassCode } from "@/lib/class-code"
import { z } from "zod"

const createSchema = z.object({ name: z.string().min(1).max(50) })

// GET — list my classes (teacher: owned, student: enrolled)
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (session.user.role === "TEACHER") {
    const classes = await prisma.class.findMany({
      where: { teacherId: session.user.id },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(classes)
  }

  const enrollments = await prisma.classEnrollment.findMany({
    where: { studentId: session.user.id },
    include: { class: { include: { teacher: { select: { name: true } } } } },
  })
  return NextResponse.json(enrollments.map((e) => e.class))
}

// POST — create class (teacher only)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { name } = createSchema.parse(body)

  // Retry until unique code is generated
  let classCode: string
  let attempts = 0
  do {
    classCode = generateClassCode()
    attempts++
    const existing = await prisma.class.findUnique({ where: { classCode } })
    if (!existing) break
  } while (attempts < 10)

  const newClass = await prisma.class.create({
    data: { name, classCode, teacherId: session.user.id },
  })

  return NextResponse.json(newClass, { status: 201 })
}
```

### API：`src/app/api/classes/join/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const joinSchema = z.object({ classCode: z.string().length(6) })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }

  const { classCode } = joinSchema.parse(await req.json())

  const targetClass = await prisma.class.findUnique({ where: { classCode: classCode.toUpperCase() } })
  if (!targetClass) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  const existing = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId: targetClass.id, studentId: session.user.id } },
  })
  if (existing) {
    return NextResponse.json({ error: "Already enrolled" }, { status: 409 })
  }

  const enrollment = await prisma.classEnrollment.create({
    data: { classId: targetClass.id, studentId: session.user.id },
  })

  return NextResponse.json({ enrollment, class: targetClass }, { status: 201 })
}
```

### 首頁路由邏輯（`src/app/page.tsx`）

```typescript
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function HomePage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role === "TEACHER") redirect("/teacher")
  redirect("/student")
}
```

### 登入頁（`src/app/(auth)/login/page.tsx`）

```typescript
import { signIn } from "@/lib/auth"

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm border w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-2">AI 大智若愚</h1>
        <p className="text-gray-500 text-sm mb-8">智能學習平台</p>
        <form
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/" })
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 border rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            以學校 Google 帳號登入
          </button>
        </form>
      </div>
    </main>
  )
}
```

### Sprint 1 完成驗證

- [ ] 老師可建立班級，得到 6位 classCode
- [ ] 學生輸入 classCode 成功加入班級
- [ ] 老師/學生各自被重定向至正確 Dashboard
- [ ] 重複加入同一班返回 409

---

## Sprint 2 — 閃卡系統

### API：`src/app/api/flashcard-decks/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  title: z.string().min(1).max(100),
  classId: z.string().optional(),
  isPublic: z.boolean().default(false),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const decks = await prisma.flashcardDeck.findMany({
    where: { ownerId: session.user.id },
    include: { _count: { select: { cards: true } } },
    orderBy: { updatedAt: "desc" },
  })
  return NextResponse.json(decks)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const data = createSchema.parse(await req.json())
  const deck = await prisma.flashcardDeck.create({
    data: { ...data, ownerId: session.user.id },
  })
  return NextResponse.json(deck, { status: 201 })
}
```

### API：`src/app/api/flashcard-decks/[deckId]/due/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — cards due for review today (SM-2)
export async function GET(_req: NextRequest, { params }: { params: { deckId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cards = await prisma.flashcard.findMany({
    where: { deckId: params.deckId },
    include: {
      reviews: {
        where: { userId: session.user.id },
      },
    },
  })

  const now = new Date()
  const dueCards = cards.filter((card) => {
    const review = card.reviews[0]
    // New cards (no review record) are always due
    if (!review) return true
    return review.nextReviewAt <= now
  })

  return NextResponse.json(dueCards)
}
```

### API：`src/app/api/flashcard-decks/[deckId]/review/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calculateNextReview, getInitialSM2State } from "@/lib/sm2"
import { broadcastPointsAwarded } from "@/lib/pusher"
import { z } from "zod"

const reviewSchema = z.object({
  cardId: z.string(),
  grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  classId: z.string(), // For points broadcasting
})

export async function POST(req: NextRequest, { params }: { params: { deckId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { cardId, grade, classId } = reviewSchema.parse(await req.json())

  // Get or initialize SM-2 state
  const existing = await prisma.flashcardReview.findUnique({
    where: { cardId_userId: { cardId, userId: session.user.id } },
  })

  const currentState = existing ?? getInitialSM2State()
  const nextState = calculateNextReview(currentState, grade)

  const review = await prisma.flashcardReview.upsert({
    where: { cardId_userId: { cardId, userId: session.user.id } },
    create: {
      cardId,
      userId: session.user.id,
      ...nextState,
      lastReviewAt: new Date(),
    },
    update: {
      ...nextState,
      lastReviewAt: new Date(),
    },
  })

  // Award points only if this was the last card in a completed session
  // (Client should send a separate POST to /api/classes/[classId]/points
  // with reason=FLASHCARD after completing the full deck review)

  return NextResponse.json(review)
}
```

### SM-2 積點觸發

在學生完成一整組閃卡複習後，前端呼叫 `POST /api/classes/[classId]/points`：

```json
{ "reason": "FLASHCARD", "amount": 20 }
```

### Sprint 2 完成驗證

- [ ] 建立牌組和卡片
- [ ] 複習 session 正確按 SM-2 計算下次日期
- [ ] `grade=0` 後 interval 重設為 1
- [ ] 完成複習後 +20 積點

---

## Sprint 3 — 衝關任務（老師端）

### API：`src/app/api/classes/[classId]/missions/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { broadcastNewMission } from "@/lib/pusher"
import { z } from "zod"

const missionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(["VIDEO", "FORM", "AI_QUIZ", "PROMPT"]),
  content: z.record(z.unknown()),
  difficulty: z.enum(["BASIC", "ADVANCED", "CHALLENGE"]).default("BASIC"),
  prereqId: z.string().optional(),
  pointsReward: z.number().int().min(10).max(500).default(100),
  order: z.number().int().default(0),
})

export async function GET(_req: NextRequest, { params }: { params: { classId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const missions = await prisma.mission.findMany({
    where: {
      classId: params.classId,
      // Students only see published missions
      ...(session.user.role === "STUDENT" ? { status: "PUBLISHED" } : {}),
    },
    orderBy: { order: "asc" },
    include: {
      // Include student's submission status
      submissions:
        session.user.role === "STUDENT"
          ? { where: { studentId: session.user.id }, select: { status: true } }
          : { select: { id: true, status: true, aiScore: true, student: { select: { name: true } } } },
    },
  })

  return NextResponse.json(missions)
}

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const session = await auth()
  if (!session?.user || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Verify teacher owns this class
  const cls = await prisma.class.findFirst({
    where: { id: params.classId, teacherId: session.user.id },
  })
  if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 })

  const data = missionSchema.parse(await req.json())
  const mission = await prisma.mission.create({
    data: { ...data, classId: params.classId },
  })

  // Broadcast to class if publishing immediately
  if (mission.status === "PUBLISHED") {
    await broadcastNewMission(params.classId, {
      missionId: mission.id,
      title: mission.title,
      type: mission.type,
      pointsReward: mission.pointsReward,
    })
  }

  return NextResponse.json(mission, { status: 201 })
}
```

### API：`src/app/api/ai/generate-quiz/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateQuiz } from "@/lib/claude"
import { z } from "zod"

const schema = z.object({
  sourceText: z.string().min(50).max(8000),
  count: z.number().int().min(3).max(10).default(5),
  difficulty: z.enum(["BASIC", "ADVANCED", "CHALLENGE"]).default("BASIC"),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = schema.parse(await req.json())

  try {
    const result = await generateQuiz(data.sourceText, data.count, data.difficulty)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_UNSAFE") {
      return NextResponse.json({ error: "Content flagged as unsafe" }, { status: 422 })
    }
    throw error
  }
}
```

### API：`src/app/api/missions/[missionId]/submissions/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — list submissions for a mission (teacher only, sorted by AI score desc)
export async function GET(_req: NextRequest, { params }: { params: { missionId: string } }) {
  const session = await auth()
  if (!session?.user || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const submissions = await prisma.missionSubmission.findMany({
    where: { missionId: params.missionId },
    include: { student: { select: { id: true, name: true, image: true } } },
    orderBy: [
      { status: "asc" },    // PENDING first
      { aiScore: "desc" },  // Highest AI score first
    ],
  })

  return NextResponse.json(submissions)
}
```

### Sprint 3 完成驗證

- [ ] 老師可建立 4 種類型任務
- [ ] AI 出題：貼入文字後 3 秒內返回題目 JSON
- [ ] 任務發佈後 Pusher 廣播
- [ ] 待審清單按 AI 評分排序，PENDING 優先

---

## Sprint 4 — 衝關任務（學生端）+ 積點系統

### API：`src/app/api/missions/[missionId]/submit/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { evaluatePrompt } from "@/lib/claude"
import type { PromptMissionContent, PromptSubmissionContent } from "@/types/mission"

export async function POST(req: NextRequest, { params }: { params: { missionId: string } }) {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }

  const mission = await prisma.mission.findUnique({
    where: { id: params.missionId, status: "PUBLISHED" },
  })
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  // Check prerequisite
  if (mission.prereqId) {
    const prereqDone = await prisma.missionSubmission.findFirst({
      where: { missionId: mission.prereqId, studentId: session.user.id, status: "APPROVED" },
    })
    if (!prereqDone) {
      return NextResponse.json({ error: "Complete prerequisite mission first" }, { status: 403 })
    }
  }

  // Check no duplicate
  const existing = await prisma.missionSubmission.findUnique({
    where: { missionId_studentId: { missionId: params.missionId, studentId: session.user.id } },
  })
  if (existing) return NextResponse.json({ error: "Already submitted" }, { status: 409 })

  const body = await req.json()
  let aiScore: number | undefined
  let aiFeedback: string | undefined

  // AI evaluation for PROMPT type
  if (mission.type === "PROMPT") {
    const content = mission.content as PromptMissionContent
    const submission = body.content as PromptSubmissionContent
    try {
      const evaluation = await evaluatePrompt(submission.promptText, content)
      if (!evaluation.safe) {
        return NextResponse.json({ error: "Content flagged", reason: evaluation.reason }, { status: 422 })
      }
      aiScore = evaluation.score
      aiFeedback = evaluation.feedback
    } catch {
      // Non-blocking: save submission without AI score if Claude is unavailable
    }
  }

  const submission = await prisma.missionSubmission.create({
    data: {
      missionId: params.missionId,
      studentId: session.user.id,
      content: body.content,
      aiScore,
      aiFeedback,
    },
  })

  return NextResponse.json({ submission, aiScore, aiFeedback }, { status: 201 })
}
```

### API：`src/app/api/classes/[classId]/points/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { broadcastPointsAwarded } from "@/lib/pusher"
import { z } from "zod"

// GET — leaderboard + personal history
export async function GET(_req: NextRequest, { params }: { params: { classId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const leaderboard = await prisma.pointTransaction.groupBy({
    by: ["userId"],
    where: { classId: params.classId },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 50,
  })

  // Enrich with user names
  const userIds = leaderboard.map((r) => r.userId)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, image: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const ranked = leaderboard.map((r, i) => ({
    rank: i + 1,
    user: userMap[r.userId],
    totalPoints: r._sum.amount ?? 0,
  }))

  return NextResponse.json(ranked)
}

// POST — award points (teacher: any reason, student: FLASHCARD/ATTENDANCE only)
const awardSchema = z.object({
  userId: z.string().optional(),  // Teacher awards to specific student; student awards to self
  amount: z.number().int().min(1).max(200),
  reason: z.enum(["ATTENDANCE", "MISSION", "FLASHCARD", "TEACHER"]),
  note: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const data = awardSchema.parse(await req.json())

  // Students can only award themselves for system events
  if (session.user.role === "STUDENT") {
    if (!["FLASHCARD", "ATTENDANCE"].includes(data.reason)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    data.userId = session.user.id
  }

  const targetUserId = data.userId ?? session.user.id

  const [tx] = await prisma.$transaction([
    prisma.pointTransaction.create({
      data: {
        userId: targetUserId,
        classId: params.classId,
        amount: data.amount,
        reason: data.reason,
        awardedBy: session.user.role === "TEACHER" ? session.user.id : null,
        note: data.note,
      },
    }),
  ])

  // Get new total
  const total = await prisma.pointTransaction.aggregate({
    where: { userId: targetUserId, classId: params.classId },
    _sum: { amount: true },
  })

  // Broadcast to class
  await broadcastPointsAwarded(params.classId, {
    userId: targetUserId,
    amount: data.amount,
    reason: data.reason,
    totalPoints: total._sum.amount ?? 0,
    note: data.note,
  })

  return NextResponse.json(tx, { status: 201 })
}
```

### AI 評分 Route：`src/app/api/ai/evaluate-prompt/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { evaluatePrompt } from "@/lib/claude"
import { z } from "zod"
import type { PromptMissionContent } from "@/types/mission"

const schema = z.object({
  promptText: z.string().min(1).max(2000),
  missionContent: z.object({
    scenario: z.string(),
    rubric: z.string(),
    level: z.string(),
    template: z.string().optional(),
  }),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { promptText, missionContent } = schema.parse(await req.json())

  const result = await evaluatePrompt(promptText, missionContent as PromptMissionContent)
  return NextResponse.json(result)
}
```

### Sprint 4 完成驗證

- [ ] 學生提交 Prompt 後 1.5 秒內看到 AI 評分
- [ ] 學生頁面收到 Pusher `mission-approved` 後積點動畫
- [ ] 前置任務未完成時返回 403
- [ ] 排行榜正確顯示所有學生積點

---

## Sprint 5 — 前端 UI

> Claude Code 在此 Sprint 負責建立以下頁面。設計語言：簡潔、香港本地化（繁中為主），優先 iPad 觸控體驗。

### 學生端頁面

#### `src/app/student/page.tsx` — 學生 Dashboard

顯示：
- 今日待複習閃卡數量（badge）
- 當前班級積點 + 排名
- 最新未完成任務（最多 3 個）
- Pusher 訂閱：監聽 `class-{classId}` 的 `points-awarded` 和 `mission-approved`，收到後 Toast 通知 + 積點數字動畫

#### `src/app/student/missions/page.tsx` — 衝關地圖

顯示：
- 以地圖形式呈現所有 PUBLISHED 任務
- 節點狀態：`LOCKED`（灰色鎖）/ `AVAILABLE`（藍色，可點擊）/ `PENDING`（橙色，等待審批）/ `DONE`（綠色✓）
- 點擊可用任務 → 彈出任務詳情 Modal
- Modal 內依 `type` 渲染不同作答介面（見下）

**任務作答介面（按 type）**：

| type | 介面 |
|------|------|
| `AI_QUIZ` | 多選題列表，即時計分，≥ passScore 後自動提交 |
| `PROMPT` | 文字框 + 「測試 Prompt」按鈕（呼叫 Haiku 評分預覽）+ 正式提交 |
| `VIDEO` | YouTube iframe embed，達到 minWatchPct 後解鎖提交按鈕 |
| `FORM` | 外部連結按鈕 + 自我申報確認 Checkbox |

#### `src/app/student/flashcards/page.tsx` — 閃卡管理

- 牌組列表（顯示今日待複習數量）
- 建立新牌組
- 進入複習 Session

#### `src/app/student/flashcards/[deckId]/review/page.tsx` — 複習 Session

- 翻轉動畫（CSS transform rotateY）
- 四個評分按鈕：「完全不記得」/ 「有點印象」/ 「記得了」/ 「輕鬆記得」
- 進度條：X / 總數
- 完成後呼叫 `POST /api/classes/[classId]/points` 派 +20 分

---

### 老師端頁面

#### `src/app/teacher/page.tsx` — 老師 Dashboard

- 班級列表 + 快速切換
- 待審批任務數量（紅色 badge）
- 學生積點排行榜（前 10）
- 快速發點 Widget（選學生 + 填分數）

#### `src/app/teacher/missions/page.tsx` — 任務管理

- 任務列表（按 order 排序）+ 狀態 toggle（DRAFT/PUBLISHED）
- 「新增任務」按鈕

#### `src/app/teacher/missions/new/page.tsx` — 新增任務

- Step 1：選擇任務類型（4 個大圖示卡片）
- Step 2：填寫內容（依類型顯示不同表單）
  - PROMPT 類型：需填 scenario 和 rubric
  - AI_QUIZ 類型：貼入教材文字 → 點擊「AI 出題」→ 預覽並可編輯生成的題目
- Step 3：設定積點、難度、前置任務、排序
- 儲存為 DRAFT 或直接發佈

#### `src/app/teacher/missions/[missionId]/submissions/page.tsx` — 審批頁

- 待審列表（PENDING 狀態，按 aiScore 降序）
- 每個提交顯示：學生名、提交時間、AI 評分、提交內容預覽
- 一鍵 Approve / 填寫反饋 Reject
- 批核後列表即時移除該行（樂觀更新）

---

## Sprint 5 完成驗證

- [ ] iPad Safari（768px+）所有頁面正常顯示
- [ ] 老師批核後學生頁面積點即時更新（< 500ms）
- [ ] 衝關地圖節點狀態正確（前置完成後解鎖）
- [ ] 閃卡翻轉動畫流暢

---

## Sprint 5（b）— 部署至 Zeabur

### Zeabur 設定步驟

1. Push repo 至 GitHub
2. Zeabur Dashboard → New Project → GitHub Import
3. 同一 Project 內新增 **PostgreSQL** 服務（選 HK-1 區域）
4. 複製 `DATABASE_URL` 至 Next.js 服務的環境變數
5. 新增所有 `.env.example` 中的變數
6. 設定自訂域名（可選）

### 部署前必做

```bash
# 確認 build 無錯誤
pnpm build

# 產生並執行 migration（生產環境）
npx prisma migrate deploy
```

### 部署完成驗證

- [ ] `https://YOUR_APP.zeabur.app` 可存取
- [ ] Google OAuth redirect URI 已更新至 Zeabur URL
- [ ] Pusher 廣播在生產環境正常運作
- [ ] `npx prisma studio --browser none` 可連接到生產 DB

---

## 已提供的代碼文件（直接使用）

以下文件**已完成**，放入對應路徑即可，不需重新撰寫：

| 文件路徑 | 說明 |
|----------|------|
| `prisma/schema.prisma` | 完整資料庫 Schema（12 張表） |
| `src/types/mission.ts` | Mission/Submission JSON 類型定義 |
| `src/lib/sm2.ts` | SM-2 間隔記憶算法 |
| `src/lib/pusher.ts` | Pusher 服務端廣播工具 |
| `src/lib/claude.ts` | Claude API 出題 + 評分函數 |
| `src/app/api/submissions/[subId]/review/route.ts` | 批核路由（含 Pusher + 積點） |

---

## 錯誤處理規範

所有 API Route 統一回傳格式：

```typescript
// 成功
{ data: {...} }   // 或直接 {...}

// 錯誤
{ error: "Human-readable message", code?: "MACHINE_CODE" }
```

HTTP 狀態碼：
- `401` — 未登入
- `403` — 無權限（登入了但角色不對）
- `404` — 資源不存在
- `409` — 衝突（重複加入、重複提交）
- `422` — 內容不合法（AI 安全檢查失敗）
- `500` — 伺服器錯誤

---

## 測試種子資料

完成 Sprint 0 後，建立 `prisma/seed.ts`：

```typescript
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function main() {
  // Create test teacher
  const teacher = await prisma.user.upsert({
    where: { email: "teacher@school.edu.hk" },
    update: {},
    create: { email: "teacher@school.edu.hk", name: "示範老師", role: "TEACHER" },
  })

  // Create test class
  const cls = await prisma.class.upsert({
    where: { classCode: "TEST01" },
    update: {},
    create: { name: "4A ICT", classCode: "TEST01", teacherId: teacher.id },
  })

  // Create sample mission
  await prisma.mission.create({
    data: {
      classId: cls.id,
      title: "認識 Prompt Engineering",
      type: "PROMPT",
      status: "PUBLISHED",
      content: {
        scenario: "你是一位老師，請設計一個 Prompt 讓 AI 幫你為學生解釋光合作用。",
        rubric: "指令需包含：目標對象（中學生）、輸出格式（條列式）、長度限制（100字內）。",
        level: "FREE",
      },
      difficulty: "BASIC",
      pointsReward: 100,
    },
  })

  console.log("Seed completed.")
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

執行：`npx prisma db seed`（需在 `package.json` 加入 `"prisma": { "seed": "ts-node prisma/seed.ts" }`）

---

## 常見問題

**Q: Google OAuth 在本地無法回調**
A: 確認 Google Console 的 Authorized redirect URIs 包含 `http://localhost:3000/api/auth/callback/google`

**Q: Pusher 連接失敗**
A: 確認 `NEXT_PUBLIC_PUSHER_KEY` 和 `NEXT_PUBLIC_PUSHER_CLUSTER` 已設定，且不含空格

**Q: Prisma Client 在 Edge Runtime 報錯**
A: 所有 API Routes 使用 Node.js runtime（預設），勿在 `middleware.ts` 使用 Prisma

**Q: Claude API 返回非 JSON**
A: `claude.ts` 已處理 markdown fences 移除（`replace(/\`\`\`json\n?|\`\`\`\n?/g, "")`），如仍失敗請在 System Prompt 加強「only output JSON」指令

---

*文件版本：1.0 | 對應 Sprint 0–5 | 技術棧：Next.js 14 · PostgreSQL · Claude API · Pusher · Zeabur*
