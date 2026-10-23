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

## 在系統設定更換學年來源

入口為 /teacher/admin/settings 的「課後班 Google Sheet 來源及學年設定」，行政公告原有設定亦共用同一份資料。可貼完整 https://docs.google.com/spreadsheets/d/FILE_ID/edit 或Drive檔案連結；伺服器驗證Google網址並只儲存ID，不會抓取任意網址。發布到網絡的 /d/e/.../pubhtml 連結不適用。分頁gid不會自動轉換為工作表名稱，須填實際分頁名稱。

轉2027–28學年時：先停用自動流程；建立新學年的表，向相同service account分享Viewer權限；貼新連結，填新工作表名稱及2027；儲存後到行政公告選2027學年工作日預覽。確認新班級名冊已匯入、學生配對正確，再授權啟用。這是管理員主動換來源，不會自行猜測或尋找下一年的檔案。舊公告及活動保留。儲存會增加設定版本，舊預覽須重做。

## Google只讀憑證逐步設定

1. 開啟 https://console.cloud.google.com/ ，選專用學校專案。在API和服務 → 程式庫啟用Google Sheets API及Google Drive API。
2. IAM與管理 → 服務帳戶 → 建立服務帳戶，名稱例如keichi-after-school。只讀這份文件不需要專案Owner／Editor角色，也不需要全網域委派。
3. 服務帳戶 → 金鑰 → 新增金鑰 → 建立新金鑰 → JSON，下載一次。若學校政策禁止JSON金鑰，請由Workspace／Cloud管理員確認允許的連線方式；目前程式使用JSON金鑰，不會自動切換其他身分來源。
4. JSON的client_email形如keichi-after-school@PROJECT.iam.gserviceaccount.com。到原始Google Sheet按「共用」，加入該電郵，選「檢視者」。不必公開或「發布到網絡」。
5. 在網站主機的秘密環境變數AFTERSCHOOL_GOOGLE_SERVICE_ACCOUNT_JSON貼完整JSON內容。private_key中的換行保留JSON的跳脫格式；不要只貼檔名、不要把私鑰放入Git、此設定頁或聊天室。按主機流程讓新環境變數生效。
6. 同時設正確AUTH_URL、既有VAPID推送金鑰及新的獨立AFTERSCHOOL_CRON_SECRET。可在本機用 node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))' 產生64字元排程密鑰，僅存網站主機及排程工作設定。
7. 在系統設定貼表連結、分頁、年份，先保持停用；到行政公告手動預覽確認Google讀取及學生配對成功。單純「已配置」只表示憑證欄位存在，成功預覽才證明原檔可讀。

## 外部排程器逐步設定（Google Cloud Scheduler範例）

在已啟用Cloud Scheduler API並具建立工作權限的Google Cloud專案，開啟Cloud Scheduler → 建立工作。依Google Cloud提示完成專案／計費設定。

| 設定 | 值 |
|---|---|
| 名稱 | keichi-after-school-tick |
| 頻率 | * * * * * |
| 時區 | Asia/Hong_Kong |
| 目標 | HTTP |
| URL | https://teacher.keichi.edu.hk/api/cron/after-school |
| 方法 | POST |
| Authentication | 不新增Google OIDC/OAuth token |
| 自訂標頭名稱 | Authorization |
| 自訂標頭值 | Bearer 後接空格，再貼AFTERSCHOOL_CRON_SECRET的實際值 |
| 內容 | {}（可省略） |

此應用端點使用自訂共享密鑰，不驗證Google OIDC身分token。不要用Sheets的Google JSON私鑰當排程密鑰。請限制可檢視／編輯排程工作的人員，因標頭包含秘密。Console若不顯示自訂標頭，Google官方gcloud scheduler jobs create http支援 --headers；由部署管理員用其安全部署流程提供Authorization值，不將實際密鑰寫入版本控制。

先保持應用流程停用，按「立即執行」應得到HTTP200且status為DISABLED；401表示密鑰不同，503可為未設定密鑰。預覽核對完成、VAPID就緒後，在系統設定勾選授權及啟用流程，再啟用排程工作。啟用後在工作日06:00之前回NOT_DUE、週末回WEEKEND均正常。每天查最近處理紀錄及排程錯誤，推送服務ACCEPTED不表示學生已讀。

每分鐘觸發是讓伺服器自行判斷06:00整理、07:00公告、08:15首次提醒及下午一輪；不是每分鐘向學生推送。學校假期由校曆HOLIDAY控制。更換學年來源通常不需要重建排程或服務帳戶，只需分享新檔並更新連結／分頁／年份。

官方文件：
- https://docs.cloud.google.com/iam/docs/keys-create-delete
- https://developers.google.com/workspace/guides/create-credentials
- https://docs.cloud.google.com/scheduler/docs/creating
- https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/create/http

## 確認接受時間重疊

手動預覽把其他活動時間重疊列為黃色警告；勾選「我已知悉以上時間重疊，仍接受整理、刊登及建立已批活動，並按原定時間提醒學生」後才可執行。日期或重新預覽會清除勾選。無效名單、未能配對等錯誤不可略過。此操作不會取消另一活動。

相同日期更新原有公告／已批活動。最近處理紀錄的「活動／錯誤」會以黃色顯示「備註：已確認接受時間重疊，仍按設定提醒」及班別學號／重疊活動。沿用既有狀態訊息欄，無schema變更、不需db push。

確認綁定當次名單及具體衝突的預覽hash；活動時間、名稱或名單有變須重新預覽確認。同一READY記錄的相同hash和接受備註可在自動重讀時保留；新日期／新衝突不會自動接受。自動排程沒有通用略過衝突設定。

推送程序只把已識別的接受備註當作可執行警告，一般錯誤及FAILED狀態仍阻止推送。08:15及下午（星期一14:00、星期二至五15:45）時段、已送出／結果不明不重送規則不變。

驗證：13項課後班、29項黑板單元測試、TypeScript、lint（既有警告）、production build與合成資料庫／HTTP整合通過。包含確認前阻止、確認後刊登、狀態備註、同內容排程保留確認、變動衝突／舊預覽拒絕、非時間衝突錯誤不可略過、接受衝突後早上及下午推送且重跑不重送。獨立審查發現的備註阻擋推送問題已以回歸測試RED→GREEN修正。未直接操作正式資料庫或驗收正式部署。
