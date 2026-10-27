# 活動批准與Google Calendar同步分開

新活動預設不同步Google，新增活動表單可勾選同步；批准規則維持admin／對應主席自動批准、其他教師待批核。批准後仍有網站行事曆與出席名單。勾選者在批准時沿用建立者與組別成員同步範圍。此版僅提供新增時選擇，不增設每位教師訂閱偏好或批量清理。

活動通告批准產生的活動及自動課後班活動預設不同步Google。手動新增學校／假期等行事曆項目維持原有同步行為。即時建立、修改、組別分發、手動補同步及Google反向更新都檢查CalendarEvent.googleSyncEnabled，避免未勾選活動稍後被補入。

## 先更新資料庫，再合併部署

新增Activity.googleSyncEnabled、CalendarEvent.googleSyncEnabled。不能先部署新程式，否則資料庫缺欄位；目前PR保持未合併，沒有操作正式DB。

在已有備份及正確DATABASE_URL設定的專案環境，取得此PR分支後執行：

```sh
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/202610270003_activity_google_opt_in/migration.sql
npx prisma generate
```

SQL在交易中新增欄位，舊Activity明確保留true，再將新資料預設改為false；舊CalendarEvent預設true。直接db push會把舊Activity也填成false，不能保留相同的舊設定，因此此更新應使用提供的SQL。SQL只能套用一次，不要重跑；先確認欄位尚未存在。完成後再合併並部署新程式。

已在Google的舊活動不批量移除。既有活動（包括自動課後班）沿用原同步選擇，來源重整亦保留該選擇；只有新建課後班預設關閉。此版不做清理。

## 驗證

Node24測試：

```sh
node --import ./tests/google-sync-opt-in/loader.mjs --test tests/google-sync-opt-in/sync.test.mjs
```

6項真實同步／活動行事曆函式搭配替代資料及HTTP依賴測試通過；測試先在舊程式因未阻止同步及補入而失敗，再通過。覆蓋關閉時零Google請求、手動補同步篩選、勾選同步、舊手動事件、反向同步篩選及批准後網站事件仍建立。未執行完整DB整合、Prisma generate、型別檢查、production build或瀏覽器驗收。
