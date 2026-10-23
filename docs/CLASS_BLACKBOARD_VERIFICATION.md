# 班級黑板驗證及實作決定

日期：2026-10-23。範圍：minglo94/keichi，codex/class-blackboard；未合併、未部署、未連正式資料庫。

## 驗證結果

| 檢查 | 結果 |
|---|---|
| npm run test:blackboard | 21/21 通過 |
| TypeScript：npx tsc --noEmit | 通過 |
| npm run lint | 無錯誤；4 項原有警告，新增黑板檔案沒有警告 |
| npm run build | 通過；本環境無法下載 Google Fonts，以 Next 的字型測試替代機制使用本機字型；產品字型程式未修改 |
| 新增 SQL | 原有完整 schema 建立後，新 SQL 在本地 PGlite PostgreSQL 上成功套用 |
| HTTP 整合 | 真實 Next.js + Prisma + 合成 PostgreSQL：登入、唯讀身份、跨班隔離、同源拒絕、作者權限、版本衝突、手動課表、管理員課節、多班公告、欠交解決、重設、登出、同名班別拒絕及 cascade 通過 |
| 桌面／手機瀏覽器 | 真實 Chromium：班級登入、今日／全週切換、結構化留堂、實際 30 秒更新、共用版面儲存／重新載入、鍵盤移動、指標拖放、手機單欄及無橫向溢出、重設密碼與舊裝置退出均通過；無 pageerror |
| 畫面檢視 | 已檢視桌面及 390px 手機截圖；為合成班級及資料 |
| git diff --check | 通過 |

正式 PostgreSQL 的遷移及並發負載、正式反向代理 IP header、正式 HTTPS cookie 行為、外部字型下載及校方實際資料驗收仍須在發布環境確認。測試與編譯成功不表示已完成正式部署驗收。

## 獨立程式審查

審查員未發現 Critical；提出的 4 項 Important 均已修正：
1. 存放班名及登入輸入使用相同 trim／大寫正規化；同名（含空格、tab、全形空白）拒絕登入。
2. 任教老師初始存取權及科目均採明確班別映射；1A/1B 同時支援兩班，含糊 1AB 不授予 1A 權限。
3. 首次儲存的資料庫唯一鍵競爭轉為 409，不偽裝成連線失敗 503。
4. 重新載入資料後提供明確的「檢閱後採用最新版本（保留草稿）」操作，可保留位置並採用已檢閱版本。

審查提出的預設版面差異、拖放格距及具名課節時間三點亦已修正：編輯與顯示共用預設版面；格距計算包含間距；具名時段不會錯借編號課堂的時間。相關回歸測試通過，沒有遞延 minor 項目。

## 實作決定與限制

- 使用全新 checkout 的功能分支作隔離工作目錄，沒有既有本地工作需保護；不另建立多餘 worktree。代價：本地 Git commit 歷史與最後透過 GitHub API 建立的整合提交不同，最終 tree 須比對一致。
- 原有 npm ci 因 lock 缺少 web-push 套件失敗；先用 npm install --ignore-scripts 修正 lock，未新增產品用途的外部套件。代價：PR 包含必要 lock 更新。
- 原有班級詳情實際位於 /teacher/classroom/[classId]，在該頁加入連結，新編輯入口保留設計的 /teacher/classes/[classId]/blackboard。代價：兩種既有／新增路徑並存。
- 本容器沒有可用的原生 PostgreSQL／Docker，系統 UID 限制亦阻止安裝服務；測試採暫存 PGlite + socket adapter，只有測試連線停用 statement cache。代價：原生 PostgreSQL 的部署與並發驗收未被替代。
- 資料庫、會話及卡片 HTTP 測試整合在 tests/blackboard-http.ts，而非多個重複初始化的單獨 DB 腳本。代價：HTTP 驗證需要新建的合成資料庫及本地 app。
- 使用 z.output<S> 作 request body reader 的輸出型別，確保 Zod 預設值經解析後不再是 optional。代價：無產品行為改變。
- 設計與計劃明確授權功能分支及 draft PR；不詢問重複整合選項，也不合併會自動部署的 main。
- 本環境 Git CLI 沒有寫入身份，使用已連接 GitHub 工具建立同一內容的整合提交及 PR。代價：遠端使用一個整合實作提交；保留原有規格及計劃提交。

操作、資料保留及正式 SQL 套用方式見 CLASS_BLACKBOARD.md。

## 合併至含課後班功能的main（2026-10-23）

與PR73整合時，package.json測試指令及schema.prisma末段出現衝突。已保留test:blackboard、test:after-school與兩套完整資料模型；Prisma產生成功。相對課後班版本的schema差異只有七個新增Blackboard資料表及其索引／外鍵，沒有DROP或既有欄位修改。

合併版本驗證：黑板21項及課後班12項測試、TypeScript、lint（4項原有警告）、production build通過。合成PGlite基線可依序套用兩份migration；正式建置伺服器的黑板HTTP、課後班DB與HTTP整合通過。此輪Chromium啟動SIGSEGV，未能重跑畫面檢查；原PR桌面及手機驗證見前文。未操作正式資料庫。
