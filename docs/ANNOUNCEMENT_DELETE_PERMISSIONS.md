# 公告刪除權限

一般公告只允許目前仍有教師／管理員角色的建立者、ADMIN、公告committee所屬組別主席刪除。一般組員、其他組別主席及學生不可刪除；沒有committee的公告僅建立者／ADMIN可刪除。target是收件對象，不授予刪除權限。

API重新讀取User.role及CommitteeRole.isChair，不依賴舊JWT權限。列表回傳canDelete給教師介面，後端DELETE仍獨立驗證。自動課後班公告繼續由來源整理流程管理，不能直接刪除。

介面只在canDelete時顯示刪除按鈕，等待伺服器成功後才移除項目；403／409及連線失敗保留公告並顯示錯誤。此次僅修改刪除權限，編輯／置頂權限不擴大。無schema變更。

## 驗證

3項純權限測試及3項真實DELETE handler／列表能力測試（替代資料庫與認證依賴）通過；涵蓋建立者、管理員、對應主席、一般組員、其他主席、學生、已撤銷帳戶、未登入、找不到公告及自動課後班保護。

API測試使用Node 24原生TypeScript與同步module hooks，不安裝依賴、不接觸正式資料庫：

```sh
node --import ./tests/announcement-delete-api/loader.mjs --test tests/announcement-delete-api/api.test.mjs
```

純權限測試可在現有tsx環境執行：

```sh
node --import tsx --test tests/announcement-delete.test.ts
```

既有8項課後班格式／學生無姓名投影測試亦通過。本次未執行完整Prisma整合、型別檢查、production build或瀏覽器視覺驗收。
