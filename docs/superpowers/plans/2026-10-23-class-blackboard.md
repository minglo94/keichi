# Class Blackboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在 minglo94/keichi 提供班級唯讀電子黑板及教師編輯入口。
**Architecture:** 保留教師 NextAuth，另設可撤銷的班級會話。新增黑板資料表，以伺服器投影整合現有功課、欠交及時間表；教師明確發布公告與活動，前台不讀教師 API。
**Tech Stack:** Next.js 14 App Router、TypeScript、Prisma 6、PostgreSQL、React 18、Tailwind、Zod、bcryptjs；使用既有 tsx 加 Node test runner。
**Spec:** docs/superpowers/specs/2026-10-23-class-blackboard-design.md（使用者已於本對話確認）

## Global Constraints
- Repository: minglo94/keichi；分支 codex/class-blackboard，不修改 keichi_local。
- 所有校務日期及時間採 Asia/Hong_Kong。
- 前台每 30 秒讀取黑板，頁面隱藏時暫停，恢復可見時立即更新。
- 會話使用 HttpOnly、SameSite cookie，production 使用 Secure，8 小時到期。
- 採版本檢查，遇衝突回傳 409，避免老師互相覆蓋。
- 留堂資訊顯示班別、學號、日期、時間、地點，不顯示姓名。
- 只有教師可以編輯及拖放便條。
- 測試只用本地資料庫，不使用無 :local 後綴的既有資料庫腳本。
- 不合併 main、不部署、不連正式資料庫；交付 PR 及實際驗證結果。

## Review Focus
1. 班級名稱重複／正規化碰撞：登入拒絕歧義，不任選第一班（Task 2）。
2. 合班代碼及同節多科：只採明確班別映射，保留同節多項，不把 1A 課堂誤配 1B（Task 3）。
3. 手機拖放及多教師同時儲存：可按鈕／鍵盤操作；舊版本 409 不覆蓋新版本（Task 4、5）。
4. 香港午夜及週末：公告起訖採半開區間，週末不標示星期一為目前課堂（Task 3）。
5. 登入後重設密碼與背景重新整理競態：舊會話下一次讀取 401；舊 fetch 不覆蓋新畫面（Task 2、5）。

## Task 1: 資料模型及本地測試基礎
**Files:** Modify prisma/schema.prisma、package.json；Create prisma/migrations/202610230001_class_blackboard/migration.sql、src/lib/blackboard/types.ts、src/lib/blackboard/validation.ts、tests/blackboard-validation.test.ts、tests/blackboard-models-db.ts。
**Interfaces:** 產生 BoardCardInput、BoardLayoutInput、BoardTimetableInput 及 BoardSnapshot 型別；schema exports cardInputSchema、layoutInputSchema、timetableInputSchema。
- [x] 寫失敗驗證測試：cardInputSchema.safeParse({type:"DETENTION",studentNumbers:["08"],date:"2026-02-30",startTime:"16:00",endTime:"15:00",location:"201"}).success === false；layoutInputSchema 拒絕重複卡片 id、負座標及超出 12 欄。
- [x] 執行 node --import tsx --test tests/blackboard-validation.test.ts，確認缺少模組而失敗。
- [x] 新增 BlackboardAccess（classId unique、passwordHash、enabled、sessionVersion）、BlackboardSession（tokenHash unique、accessId、expiresAt、sessionVersion）、BlackboardCard（authorId、type、subject、payload Json、color enum、pinned、startsAt、endsAt、archivedAt、version）、BlackboardCardTarget（cardId/classId unique）、BlackboardLayout（classId unique、items Json、version）、BlackboardTimetable（classId unique、source AUTO/MANUAL、rows Json、version）及 BlackboardSchedule（唯一 school key、slots Json、version）。加外鍵、索引及必要反向關聯。多班卡片只允許 ADMIN；教師單班卡片用同一 target 模型。
- [x] 定義 DTO 只含班別、學號、科目、文字及顯示資料；不含 session token、密碼雜湊、學生姓名、內部備註。Zod 對 payload 按 type 區分；只接受 https/http 連結；限制文字及 JSON 大小。
- [x] 加 test:blackboard 命令 node --import tsx --test tests/blackboard-*.test.ts；本地獨立測試資料庫執行新遷移及 models-db 測試，驗證 FK、unique、刪班 cascade，不啟動舊 seed。
- [x] 執行 npx prisma validate、npm run test:blackboard，預期全部通過；提交 feat: add blackboard models and validation。

## Task 2: 班級登入及權限
**Files:** Create src/lib/blackboard/access.ts、src/lib/blackboard/session.ts、src/lib/blackboard/request.ts、src/app/api/blackboard/login/route.ts、src/app/api/blackboard/logout/route.ts、src/app/api/teacher/classes/[classId]/blackboard/access/route.ts、tests/blackboard-session.test.ts、tests/blackboard-auth-http.ts。
**Interfaces:** requireBoardSession(): Promise<{classId:string}>；requireBoardTeacher(classId:string,mode:"publish"|"manage"): Promise<{userId:string;isManager:boolean}>，拒絕時回傳或拋出統一可映射 HTTP 錯誤；requireSameOrigin(request:Request): void。
- [x] 寫失敗測試：1A cookie 查詢 1B 仍只識別 1A；缺少／過期／停用／版本失效會話皆 401；重複班名登入失敗；非教師寫入 403；惡意 Origin 拒絕。
- [x] 執行 session 測試確認失敗。
- [x] 實作 32-byte 隨機 token、只儲存 SHA-256 雜湊、8 小時有效、獨立 cookie。登入以班級及可信來源限流（不信任任意 forwarded header）、bcrypt 固定 dummy hash 比對不存在帳戶，訊息統一。設定密碼無預設值；重設／停用於 transaction 增加版本並撤銷會話。
- [x] 沿用 requireClassAccess，publish 允許有存取權教師；manage 僅 admin/owner/homeroom。班級 cookie 不能兌換教師身份；所有寫入檢查同源、body 大小與 schema。
- [x] HTTP 合成帳戶測試登入、登出、限流、立即撤銷、教師／班級身份隔離；每個拒絕確認資料庫無寫入。
- [x] 測試通過後提交 feat: add scoped blackboard sessions。

## Task 3: 班級資料投影及星期一至五課表
**Files:** Create src/lib/blackboard/snapshot.ts、src/lib/blackboard/timetable.ts、src/app/api/blackboard/route.ts、src/app/api/teacher/classes/[classId]/blackboard/timetable/route.ts、src/app/api/teacher/blackboard/schedule/route.ts、tests/blackboard-snapshot.test.ts、tests/blackboard-timetable.test.ts、tests/blackboard-snapshot-db.ts。
**Interfaces:** getBoardSnapshot(classId:string,now:Date): Promise<BoardSnapshot>；getBoardTimetable(classId:string): Promise<BoardSnapshot["timetable"]>；getLessonState(rows:BoardSnapshot["timetable"]["rows"],now:Date): {currentIds:string[];nextIds:string[];status:string}。
- [x] 寫失敗測試：resolved 欠交不出現；HOMEWORK_ABSENT 獨立；JSON 不含 name/email/note；startsAt <= now < endsAt；香港週六顯示週末；課堂結束時不仍列 current；同節多項均保留。
- [x] 跑對應 Node 測試確認失敗。
- [x] 實作明確 Prisma select 投影，學號從本班 enrollment 取得；缺學號顯示未設定，不拿姓名代替。讀取失敗回傳 503，不回傳空成功。
- [x] 使用 getLatestTerm、AgentTimetable、classKey／lessonClassKeys；只明確匹配本班，額外建立保守合班代碼解析測試，歧義標為需設定而非猜測。MANUAL 模式明確替代 AUTO；手動表為週一至五、保留同節多科。
- [x] 管理員設定 school slots；既有 src/lib/school-periods.ts 僅作可確認的初始建議，不能自動當已確認配置。小息／午膳可配置；named slot 與 numbered slot 不錯配，未配置無 current 時間。
- [x] GET /api/blackboard 完全由會話取 classId，Cache-Control: no-store。手動課表寫入僅 manager；school schedule 僅 ADMIN；PUT 使用 expectedVersion，衝突 409。
- [x] 跑單元及本地資料庫合成測試；提交 feat: project class data and weekly timetable。

## Task 4: 教師卡片及共用版面 API
**Files:** Create src/lib/blackboard/cards.ts、src/lib/blackboard/layout.ts、src/app/api/teacher/classes/[classId]/blackboard/route.ts、src/app/api/teacher/classes/[classId]/blackboard/cards/route.ts、src/app/api/teacher/classes/[classId]/blackboard/cards/[cardId]/route.ts、src/app/api/teacher/classes/[classId]/blackboard/layout/route.ts、tests/blackboard-cards-db.ts、tests/blackboard-layout.test.ts。
**Interfaces:** createBoardCard(actorId:string,classId:string,input:BoardCardInput): Promise<{id:string;version:number}>；updateBoardCard(actorId:string,classId:string,cardId:string,input:BoardCardInput,expectedVersion:number): Promise<void>；saveBoardLayout(classId:string,input:BoardLayoutInput,expectedVersion:number): Promise<void>。
- [x] 寫失敗測試：subject teacher 修改其他作者卡片 403；嘗試以 1A 路由修改 1B 卡片 404；舊 version 409；無效 layout reference 拒絕；ADMIN 多班發布只對目標班出現。
- [x] 跑對應測試確認失敗。
- [x] 實作 teacher publish/create、author update、manager 全板管理及 layout 寫入。任教老師只可選有權限班別及自己任教科目；科目來源不明時拒絕科目發布並提示由班主任處理。
- [x] 使用 DB transaction + version 條件更新；archive 替代刪除。全校發布由 server 展開當時班級 targets，UI 說明不自動涵蓋日後新班。
- [x] 公告／活動以教師明確選取內容建立黑板卡片快照；不提供 unrestricted 搜尋或自動同步教師內部公告；不複製隱藏備註。日期、學號、地點各自結構化。
- [x] 驗證 layout IDs 只引用本班卡片或固定 widget IDs homework/missing/timetable，限制 12-column grid；手機使用同一穩定 order。
- [x] 跑合成資料權限、transaction 衝突及 layout 測試；提交 feat: add teacher blackboard publishing APIs。

## Task 5: 班級畫面及教師編輯介面
**Files:** Create src/app/blackboard/layout.tsx、src/app/blackboard/login/page.tsx、src/app/blackboard/page.tsx、src/app/teacher/classes/[classId]/blackboard/page.tsx、src/components/blackboard/{BoardLogin,BoardViewer,BoardGrid,BoardCard,BoardEditor,CardForm,TimetableEditor,ScheduleEditor,BoardAccessSettings}.tsx、src/components/blackboard/useBoardSnapshot.ts、src/lib/blackboard/grid.ts；Modify src/app/teacher/classes/[classId]/page.tsx（先確認現有檔案，若路由不同使用實際班級詳情入口）；Create tests/blackboard-grid.test.ts。
**Interfaces:** BoardViewer({initialSnapshot:BoardSnapshot})；BoardGrid({items,editable,onChange})；useBoardSnapshot(): {snapshot:BoardSnapshot|null;error:string|null;lastUpdated:Date|null;retry:()=>void}，型別沿用 Task 1。
- [x] 寫 grid 測試：resize 限於 12 欄、移動維持穩定順序、窄螢幕不使用桌面 x/y；在瀏覽器測試紀錄中列出先失敗的登入→黑板及教師拖放流程。
- [x] 實作繁中獨立黑板：時間／班別、目前／下一節、今日／全週切換、卡片、留堂結構化欄位、全螢幕及登出；只用文字渲染；外部連結用 noopener noreferrer。
- [x] 實作教師卡片建立／編輯、顏色、置頂、起訖時間、學號多選／輸入、地點；manager 可編排、設定密碼、課表及 ADMIN school slots。依 API 權限顯示控制，拒絕仍由 server 執行。
- [x] 用 Pointer Events 實作拖放及 resize；提供上／下／左／右、增大／縮小按鈕及鍵盤操作。手機自動單欄排列；儲存才更新全班；409 保留草稿並提示重新載入。
- [x] 每 30 秒 polling、visibilitychange 暫停／恢復、AbortController 及序號忽略過期回應。401 清空敏感畫面並回登入；503 保留舊資料且標示過時、最後更新及重試，不顯示「沒有欠交」。
- [x] 執行桌面及手機瀏覽器流程，確認 layout reload／跨裝置、按鍵及 resize；提交 feat: add class blackboard and teacher editor。

## Task 6: 整體驗證、操作文件及 PR
**Files:** Create docs/CLASS_BLACKBOARD.md、tests/blackboard-http.ts；更新規格狀態與本計劃 checkboxes，依實際通過情況填寫。
**Interfaces:** 沿用 Tasks 1–5，無新公開 API。
- [x] 加 HTTP 整合測試：兩班、班主任、任教老師、無關教師及 ADMIN；全部使用合成資料，斷言全部驗收權限及公開 JSON 欄位。
- [x] 跑 npm run test:blackboard、npx tsc --noEmit、npm run lint、npm run build；跑 local DB 及 HTTP 測試。未有必要服務時準確列出未驗證項目，不宣稱通過。
- [x] 瀏覽器驗證登入→閱讀→教師發布→30 秒更新→拖放儲存→重設密碼→舊裝置登出完整流程；桌面及手機各一次。驗證週末／小息／午夜及 API 503／409。
- [x] 文件列出入口、設定初始班級密碼、教師權限、手動／AUTO 課表、課節配置、資料保留、遷移及 rollback。rollback 停用入口及還原程式，保留新表避免資料遺失；正式 migration 需另行確認。
- [x] 查看 git diff --check 及完整 branch diff，自行審查 secrets、production DB 存取、API 欄位洩漏及未授權路由；修正後重跑受影響測試。
- [x] 提交 docs: document class blackboard operations；建立指向 main 的 draft PR，描述實際功能、測試結果及未驗證限制，不合併。

## 執行方式與交付
建議 Native：由目前助理依順序實作，因會話、DTO、投影及介面共用同一組型別。若使用者選擇子代理，另依 subagent-driven-development 技能執行。此文件是待審閱實作計劃，勾選不代表已完成。


## 實際交付紀錄
21 項單元／回歸測試、整合 HTTP 及桌面／手機瀏覽器流程通過；TypeScript、lint 及離線字型替代的 build 通過。DB 測試合併至 tests/blackboard-http.ts，採本地 PGlite 而非原生 PostgreSQL。新 SQL 需正式環境審閱及驗收，不執行 production migrate deploy。已執行獨立分支審查及修正；完整證據、限制及實作決定見 docs/CLASS_BLACKBOARD_VERIFICATION.md。PR 建立狀態以實際 GitHub PR 為準。
