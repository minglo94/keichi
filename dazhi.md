# 基智若愚 ICHI — Platform Reference

**AI 大智若愚**是一個香港中學課堂教學與行政管理一體化平台，結合學生學習遊戲化（衝關地圖、SM-2 閃卡、積點）與老師行政工具（委員會管理、活動指派、行為記錄、行事曆）。

---

## 技術架構

| 項目 | 技術 |
|------|------|
| 框架 | Next.js 14 App Router + TypeScript |
| 認證 | NextAuth.js v5 + Google OAuth + PrismaAdapter |
| 資料庫 | PostgreSQL + Prisma ORM |
| 即時通訊 | Pusher Channels (HK cluster ap3) |
| AI 引擎 | Anthropic Claude API (Sonnet 3.5 / Haiku 3) |
| 部署 | Zeabur (HK-1 區域) |
| 樣式 | Tailwind CSS v3 + framer-motion |
| 驗證 | Zod |

---

## 資料庫 Schema

### 核心 Enum (Updated)

```prisma
enum Role              { STUDENT  TEACHER }
enum MissionType       { VIDEO  FORM  AI_QUIZ  PROMPT }
enum MissionStatus     { DRAFT  PUBLISHED  ARCHIVED }
enum MissionDifficulty { BASIC  ADVANCED  CHALLENGE }
enum SubmissionStatus  { PENDING  APPROVED  REJECTED }
enum PointReason       { ATTENDANCE  MISSION  FLASHCARD  TEACHER }
enum CommitteeType     { ADMIN  DISCIPLINE  IT  CURRICULUM }
enum TodoStatus        { OPEN  IN_PROGRESS  DONE }
enum AnnouncementTarget { ALL  ADMIN  DISCIPLINE  IT  CURRICULUM  CLASS }
enum Priority           { NORMAL  IMPORTANT  URGENT }
enum BehaviorType      { MISCONDUCT  MERIT }
enum ToolType          { LINK  EMBED  HTML  GOOGLE_SHEET }
enum AttendanceStatus  { PENDING  CONFIRMED  ATTENDED  ABSENT }
```

---

## Phase 3 新功能摘要 (2026-05-10)

### 1. AI "Ask ICHI" 智能助理
- **功能：** 老師可透過自然語言查詢學校記錄（例如：「誰是上星期表現優異的學生？」）。
- **實作：** `/api/ai/query` 路由使用 Claude 3.5 Sonnet，自動結合最近 30 條公告與行為記錄作為上下文回答問題。
- **UI：** 教師 Dashboard 新增指令式搜尋列，支援即時回覆與格式化顯示。

### 2. 沉浸式登入與新手導覽
- **視覺升級：** `/login` 頁面改為現代化「分欄佈局」，左側展示校園形象（含黑白轉彩色動畫），右側為登入表單。
- **新手導覽：** 實作 `OnboardingTour` 組件，使用 `framer-motion` 製作分步引導彈窗，幫助新用戶熟悉「即將行程」、「今日公告」及「衝關地圖」。
- **狀態持久化：** 使用 `localStorage` 記錄用戶是否已完成導覽。

### 3. Google 日曆自動同步
- **功能：** 發佈公告時可勾選「同步至 Google 日曆」，系統自動將該公告作為「事件」推送到學校 Google 日曆。
- **架構：** `Announcement` 模型新增 `googleEventId` 欄位；`NextAuth` 回呼函數現在會持久化 Google `accessToken` 至 JWT/Session 以供 API 調用。

### 4. 優先級公告系統
- **等級：** `URGENT`（緊急 - 紅色閃爍 🚨）、`IMPORTANT`（重要 - 琥珀色 ⭐）、`NORMAL`（普通）。
- **排序：** 公告列表與 Dashboard Widget 會根據優先級自動置頂顯示。
- **UI：** 緊急公告在 Dashboard 新增紅色邊框與脈衝動畫提醒。

### 5. 安全與穩定性增強
- **Session 管理：** 強制執行 **2 小時自動登出**（`maxAge: 7200`）。
- **安全警告：** `SessionTimeoutWatcher` 組件會在 Session 到期前 5 分鐘彈出紅色倒數警告，提示用戶存檔或重新整理。
- **學生端修復：** 解決了 Timeline 與公告 Widget 在數據加載或未授權狀態下的 Client-side Crash 問題。

---

## 完整文件結構 (Updated)

```
dazhi/
├── prisma/schema.prisma (新增 Priority Enum, googleEventId)
├── src/
│   ├── lib/
│   │   ├── auth.ts (新增 accessToken 存儲)
│   │   └── claude.ts (新增 queryKeida 邏輯)
│   ├── components/
│   │   ├── teacher/
│   │   │   └── AskICHI.tsx (AI 搜尋組件)
│   │   ├── SessionTimeoutWatcher.tsx (超時監控)
│   │   ├── OnboardingTour.tsx (新手導覽)
│   │   └── UnifiedTimeline.tsx (整合行程組件)
│   └── app/
│       ├── (auth)/login/page.tsx (全新視覺設計)
│       └── api/
│           ├── ai/query/route.ts (AI 查詢接口)
│           └── admin/classes/route.ts (班級列表接口)
```

---

*版本：Phase 3 完成 | 日期：2026-05-11 | Next.js 14 · PostgreSQL · Claude 3.5 · Google Calendar Sync · Framer Motion*
