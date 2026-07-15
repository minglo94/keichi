# 本地開發設定手冊

> 本檔教你如何在本地把「基智若愚」跑起來，並使用一個**與 Zeabur 線上資料庫完全隔離**的本地 PostgreSQL，安心開發與改 schema。

---

## 0. 架構概觀

- **App**：Next.js 14 + Prisma + PostgreSQL（App Router、TypeScript）
- **本地資料庫**：用 Docker 跑一個獨立 PostgreSQL（容器名 `keichi-pg`，對外 port **5433**）
- **環境變數分層**：
  - `.env` → Zeabur **正式**值（已進版控；部署用）
  - `.env.local` → **本地覆蓋**（`.gitignore` 忽略，不會進版控）；`next dev` 會自動以此覆蓋 `.env`
- 所以「本地開發」永遠連本地庫；「部署」才用 `.env` 的 Zeabur 值。

---

## 1. 前置需求

| 工具 | 說明 |
|------|------|
| Node.js | 已測試 v23（npm 10） |
| Docker Desktop | 用來跑本地 PostgreSQL。先 `open -a Docker` 啟動 daemon，等右上角鯨魚圖示穩定 |

確認 Docker 已就緒：
```bash
docker info >/dev/null 2>&1 && echo "Docker OK" || open -a Docker
```

---

## 2. 一次性設定（首次 / 新 clone）

```bash
# 1) 安裝依賴（會自動執行 prisma generate）
npm install

# 2) 建立本地環境覆寫檔 .env.local（內容見 §3，務必建立）
#    （手動建立，或參考下方範本貼入）

# 3) 起本地 PostgreSQL（compose 建立容器 + 持久化 volume，並等健康檢查通過）
npm run db:up

# 4) 把 schema 建進本地庫
npm run db:push:local

# 5) 匯入示範資料（帳號/班級/委員會工具/範本）
npm run db:seed:local

# 6) 啟動 dev server
npm run dev
```

打開 http://localhost:3000 → 自動導到 `/login`。

> 若你之前曾用 `docker run` 手動建立過 `keichi-pg` 容器，先 `docker rm -f keichi-pg` 再 `npm run db:up`，改由 compose 統一管理。

---

## 3. `.env.local`（本機完整環境設定）

`.env.local` 是本機開發的**完整**環境檔（已被 `.gitignore` 忽略，不會進版控）。`next dev` 會自動讀取，同名 key 以此為優先於 `.env`。

**最快做法**：把 `.env` 完整複製一份再改 4 行為本機值（所有 key 一次帶過來，AI / Pusher / Email 等功能本機也能用）：

```bash
cp .env .env.local
```

然後把 `.env.local` 中這 4 行改成下方本機值：

```bash
# 本機 PostgreSQL（Docker 容器 keichi-pg，port 5433）
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/keichi?schema=public"
DATABASE_URL_UNPOOLED="postgresql://postgres:postgres@localhost:5433/keichi?schema=public"

# 登入 / App URL 改回 localhost（才不會被導去 zeabur.app）
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

> 沒有 `.env.local` 時，`next dev` 會讀 `.env` 的 Zeabur 內部主機名（本機連不到）→ DB 功能全部失敗。**這個檔一定要建。**
> 想產生新的 `AUTH_SECRET`：`openssl rand -base64 32`。
> 因為本檔已含所有 key，本機開發不依賴 `.env`；之後可 `git rm --cached .env` 把正式金鑰移出版控（見 §8）。

---

## 4. 登入帳號（由 seed 產生）

登入頁左方「帳號密碼」表單（Google 鈕本機免用，因 OAuth callback 只登記線上域名）：

| 角色 | 帳號 | 密碼 |
|------|------|------|
| 管理員 | `admin@demo.hk` | `admin123` |
| 老師 | `teacher@demo.hk` | `teacher123` |
| 學生 | `student@demo.hk` | `student123` |

> 用 admin 登入可看到「管理」選單（用戶/群組/AI 助理管理）與所有委員會。

---

## 5. 常用指令速查（npm scripts）

| 指令 | 作用 |
|------|------|
| `npm run dev` | 啟動 Next.js dev server（http://localhost:3000，自動讀 `.env.local`） |
| `npm run build` | 正式 build（`prisma generate && next build`） |
| `npm run lint` | ESLint |
| `npm run db:up` | 起本地 PostgreSQL 容器（`docker compose up -d --wait`） |
| `npm run db:down` | 停止本地容器（資料保留） |
| `npm run db:logs` | 即時查看 DB 容器日誌 |
| `npm run db:push:local` | 把 `schema.prisma` 同步到**本地**庫（產生 client） |
| `npm run db:seed:local` | 把示範資料寫入**本地**庫 |
| `npm run db:reset:local` | **清空＋重建**本地庫並重新 seed（`down -v → up → push → seed`） |
| `npm run db:studio:local` | 開 Prisma Studio 看/改**本地**庫資料（http://localhost:5555） |

> ⚠️ 不带 `:local` 的 `npm run db:push` / `db:seed` / `db:studio` 會讀 `.env` 的 **Zeabur 正式**連線。**本地開發請一律用 `:local` 版本**，避免動到線上。

---

## 6. 開發流程

### 一般開發

App 需要**本地 PostgreSQL 容器在跑**，`npm run dev` 本身不會啟動 DB。
compose 設了 `restart: unless-stopped`，所以**只要 Docker 開著、且容器不是被 `db:down` 明確停掉**，開機後資料庫會自動回來——平常直接 `npm run dev` 即可。不確定就先確認：

```bash
docker ps | grep keichi-pg     # 有列出来 = DB 在跑
npm run db:up                  # 沒在跑就啟動（含健康檢查）

npm run dev                    # 跑 app（http://localhost:3000），改 code 自動 hot-reload
```

> 若你執行過 `npm run db:down`（或 `docker compose down`），容器已被移除，下次要先 `npm run db:up` 才會回來。單純重開機則會自動起。

### 改資料庫 schema（加欄位等）
1. 編輯 `prisma/schema.prisma`
2. `npm run db:push:local`（同步到本地庫 + 重新產生 Prisma client）
3. **重啟 dev server**（在終端機按 `Ctrl+C` 再 `npm run dev`），讓新 client 生效

本地庫隔離於線上，schema 要怎麼玩都可以；要清空重來就 `npm run db:reset:local`。

### Schema 變更安全須知（之後部署時要注意）
- **加欄位**（nullable 或有 default）→ 安全，向下相容。
- **刪除/改名欄位** → 會讓舊 Prisma client 的查詢炸掉（它還在 `SELECT` 那欄）。正式庫做這類變更前，務必先在本地驗證、規劃部署順序。
- 詳見先前討論；本地隔離環境就是用來安全試這些的。

---

## 7. 疑難排解

**`npm run dev` 說 port 3000 in use，跑到 3001**
代表有另一個 server（例如舊的 `next dev`）佔著 3000。找出並關掉：
```bash
lsof -iTCP:3000 -sTCP:LISTEN      # 看 PID
kill <PID>                         # 收掉它，再重 npm run dev
```

**連不到 DB / 頁面報資料庫錯誤**
- 確認 `.env.local` 存在且 port 是 5433（不是 5432、也不是 Zeabur 主機）。
- 確認容器在跑：`docker ps | grep keichi-pg`；沒有就 `npm run db:up`。
- 還沒建表/seed：`npm run db:push:local && npm run db:seed:local`。

**Prisma 指令連到「線上」而不是本地**
你用了沒加 `:local` 的 `npm run db:push`（它讀 `.env` 的正式連線）。**改用 `npm run db:push:local`**。

**port 5433 被佔 / 想換 port**
改 `docker-compose.yml` 的 `"5433:5432"` 與 `.env.local`、`package.json` 中 `db:*:local` scripts 的 port 三處一致即可。

**Docker daemon 沒開**
```bash
open -a Docker      # 等 30 秒再試
```

---

## 8. 與正式環境的關係（重要）

- 本地的一切新增/編輯/刪除只進**本地庫**，**不會**影響 Zeabur 上真實使用者。
- 部署到 Zeabur 時用的是 `.env`（正式值），那邊的資料庫才是線上庫。
- ⚠️ **安全提醒**：`.env` 目前已被 git 追蹤，且含**正式**金鑰（DB 密碼、Anthropic key、OAuth secret、Resend key）。若 repo 會共享/推送，建議 `git rm --cached .env` 並輪換這些金鑰。`.env.local` 則已被 `.gitignore` 忽略，安全。

---

## 9. 檔案清單

| 檔案 | 用途 |
|------|------|
| `docker-compose.yml` | 本地 PostgreSQL 定義（容器、port 5433、持久化 volume、healthcheck） |
| `.env.local` | 本地環境覆寫（gitignored） |
| `package.json` → `db:*:local` scripts | 對本地庫的 push/seed/studio/reset 等 |
| `docs/local-dev.md` | 本手冊 |
