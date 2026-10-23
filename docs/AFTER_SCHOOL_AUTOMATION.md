# 課後班每日自動化

## 時間（Asia/Hong_Kong）

| 動作 | 星期一 | 星期二至五 |
|---|---|---|
| 讀取及建立當日項目 | 06:00 | 06:00 |
| 公告生效 | 07:00 | 07:00 |
| 首次站內通知及裝置推送 | 08:15 | 08:15 |
| 第二次裝置推送 | 14:00 | 15:45 |
| 兩種課後班 | 15:30–16:30 | 16:00–17:00 |

功課輔導班303室，正向班304室。週末、校曆HOLIDAY跳過。班級名單格式「1A #08、15、23」，不公開姓名、出席、備註。只有相關學生收到提醒；公告沿用全校公告的可見範圍。同日一篇公告，每類一個已批活動及行事曆項目；以publishAt控制07:00可見，不呼叫既有立即通知的公告POST。學生首頁及行政公告提供展開名單。

管理員設定來源；行政委員會主席及管理員可選日期、預覽及執行。不可執行過去日期或已開班的當日名單。手動流程亦按設定時間發送提醒。

## 部署前設定（此PR未部署或啟用正式流程）

1. 備份資料庫，先在staging驗證新增SQL。專案原本沒有migration baseline，**不可直接假設 prisma migrate deploy 適用既有庫**。部署負責人檢查並套用 prisma/migrations/202610230002_after_school/migration.sql 的新增表、索引及外鍵，另記錄既有庫的migration策略。不要用db:push強行同步正式庫。
2. Google Cloud啟用Drive API及Sheets API，建立專用service account，將「課後班 26-27」原檔以Viewer分享給該帳戶，不公開分享。支援Google Sheets或Drive xlsx，沒有寫入scope。
3. 伺服器設定 AFTERSCHOOL_GOOGLE_SERVICE_ACCOUNT_JSON（client_email/private_key JSON）、獨立高熵至少32字元 AFTERSCHOOL_CRON_SECRET、既有 NEXT_PUBLIC_VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY、可選 VAPID_SUBJECT。AUTH_URL須為正確網站origin。私鑰不放NEXT_PUBLIC或Git。
4. 管理員在行政公告的課後班面板設定原始Google檔案ID、**實際工作表名稱**及學年2026。從原檔確認ID，勿用上傳快照作每日資料源。A:G表頭須包含班別、學號、日期、類型。支援d/m、d/m/yyyy、ISO、Excel serial，無年份按學年推算。空白預設列忽略；有學生卻缺日期、未知類型、雙班、名冊配對不唯一或活動撞期會阻止執行。
5. 先保持停用，選未來工作日預覽並核對名單、地點、時間及校曆。明確勾選管理員自動批核授權後才啟用。
6. 外部可信排程器每分鐘POST https://teacher.keichi.edu.hk/api/cron/after-school ，Header為 Authorization: Bearer <AFTERSCHOOL_CRON_SECRET>。密鑰用排程器secret store保管，不放URL／日誌。GET不支援。內部按香港時間判斷，不依主機時區，不接受HTTP假時間。確認外部排程器啟用並監測非2xx；管理頁勾選不會自行啟動排程器。

## 重跑與錯誤

同日鎖、來源hash及預覽hash防重複與過時提交。來源更正更新原項目、移除不再參加的指派、取消未送提醒；保留既有出席記錄。普通編輯、刪除、指派、批核、提醒API不可繞過來源管理，出席登記仍可用。

來源讀取、配對或撞期失敗記FAILED，暫停既有公告及活動，不當作空名單。修正後重新預覽及執行；排程未成功準備時會重試。成功的06:00快照不會每分鐘重讀來源，當日後續更正使用手動流程。有效空名單記EMPTY，不建空公告，原項目撤回；假期記SKIPPED並撤回原項目。

08:15一輪有效至下午提醒時間，下午一輪有效至開班；錯過時段不追發兩輪；推送供應商TTL亦限於本輪有效時段。管理員被撤權或停用設定後排程停止。

每學生每輪唯一站內通知，每裝置endpoint每輪唯一嘗試。ACCEPTED表示推送服務接收，**不代表已讀或裝置顯示**。UNKNOWN（超時／結果不明）不自動重送，避免重複；FAILED亦保留人工查核。404/410清除過期訂閱。鎖過期停止本輪，下次排程續處理未發送項目。

NO_DEVICE／NO_CONFIGURATION按提醒項目計數，一學生兩輪可能兩項；站內通知仍可用。學生須預先授權通知並有有效訂閱。沒有SMS或電郵代送。管理頁顯示最近30日狀態及錯誤。UNKNOWN先人工核對供應商紀錄，不可批量重送。

## 驗證

npm run test:after-school 執行純邏輯及Google adapter測試；另執行 npx tsc --noEmit、npm run lint、npm run build。

整合及HTTP測試只用**新建可丟棄本機資料庫**及合成學生、Google回應，無真實推送。依專案本機資料庫指南建立空DB，明確設DATABASE_URL與DATABASE_URL_UNPOOLED為localhost，在該庫套用完整schema後執行 node tests/run-after-school-local.mjs 。腳本插入測試資料且要求空庫，完成後丟棄測試庫，不可對正式環境執行。Next build/dev不可同時共用.next。

回復舊版本前先停用設定及外部排程器，確認沒有執行中的worker。此變更只新增資料表及關聯，可先回復應用程式並保留表供審核；若要移除，須由部署負責人在備份後按外鍵相依順序移除AfterSchool系列表。公告、活動、通知及出席資料不會因回復程式自動刪除，不可用全庫重設作rollback。

本次用PGlite PostgreSQL協定隔離合成庫驗證；正式PostgreSQL遷移及排程接線須在staging驗證。網路限制下建置使用Next字型mock代替Google Fonts下載，未改產品字型。既有HEIC require及4項lint警告未更動。
