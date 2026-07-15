# Email Service（Resend）設定與使用

> 本檔說明 `src/lib/email.ts` 這個發信模組：程式碼怎麼呼叫，以及**正式給學生用之前**必須先做好的網域（domain）設定。

---

## 1. 程式碼範例

### 1.1 單封信（最常用）

```tsx
// 注意：檔案副檔名要是 .tsx（含 JSX），或在 .ts 裡用 createElement()
import { sendEmail } from '@/lib/email'
import { WelcomeEmail } from '@/emails/welcome-email'

await sendEmail({
  to: student.email,
  subject: `歡迎加入 ${cls.name}`,
  react: (
    <WelcomeEmail
      studentName={student.name}
      className={cls.name}
      classCode={cls.classCode}
    />
  ),
  tags: [{ name: 'type', value: 'welcome' }],
})
```

> ⚠️ Next.js App Router 的 API route 預設是 `route.ts`，**JSX 不能直接寫在 `.ts` 裡**。解法二選一：
> - 把 route 改名 `route.tsx`（App Router 兩者都接受），或
> - 用 `import { createElement } from 'react'`，改寫成 `react: createElement(WelcomeEmail, { ...props })`

### 1.2 批次寄給全班（未來擴充，目前未接）

一次 call 最多 100 封，每封可不同內容——比迴圈 `sendEmail()` 快很多：

```tsx
import { resend } from '@/lib/email'
import { WelcomeEmail } from '@/emails/welcome-email'

await resend?.batch.send(
  students.map((s) => ({
    from: process.env.RESEND_FROM!,
    to: s.email,
    subject: `歡迎加入 ${cls.name}`,
    react: <WelcomeEmail studentName={s.name} className={cls.name} classCode={cls.classCode} />,
  })),
  { idempotencyKey: `welcome-${cls.id}` }   // 冗餘重發不會重複寄
)
```

### 1.3 排程發送（未來擴充，例如明早提醒複習閃卡）

```tsx
import { resend } from '@/lib/email'

const { data } = await resend!.emails.send({
  from: process.env.RESEND_FROM!,
  to: student.email,
  subject: '明日閃卡複習提醒',
  react: <ReminderEmail deck={deck} />,
  scheduledAt: '2026-08-01T09:00:00+08:00',  // ISO 8601，必須是未來時間
})
// 寄出前可改期 / 取消：
//   await resend.emails.update({ id: data!.id, scheduledAt: '2026-08-02T09:00:00+08:00' })
//   await resend.emails.cancel(data!.id)
```

> 1.2 / 1.3 直接用 raw `resend` client（模組有 export）。等用的地方多了，再回 `src/lib/email.ts` 封成 `sendBatchEmail()` / `scheduleEmail()`，讓呼叫端不碰 SDK——範本已在 `email.ts` 檔尾以註解標好。

---

## 2. 正式上線前必做：驗證寄件網域

沒做這步，信永遠只能寄到你自己的信箱。流程：

1. **準備一個你能管 DNS 的網域**（學校的 `xxx.edu.hk`，或專用子網域如 `mail.keichi.app`）。
2. Resend Dashboard → **Domains** → Add Domain → 填網域 → 選離香港最近的 region。
3. Resend 給你幾筆 **DNS 記錄**，到 DNS 供應商（Cloudflare / 學校 IT）加上：
   - **DKIM**（2~3 筆 CNAME 或 TXT）— Resend 用它簽名，證明信真的從你網域發出。**必加。**
   - **SPF**（TXT）— 授權 Resend 伺服器代發。**必加。**
   - **DMARC**（TXT，`_dmarc.你的網域`）— 建議加，告訴收件方遇到假冒信怎處理，提升送達率；先用 `p=none` 觀察。
   - （MX 不用設——那是收信用的，我們只發信。）
4. 回 Resend 按 **Verify**，等 DNS 生效（幾分鐘到幾小時）。
5. 設環境變數：
   ```bash
   # Zeabur（正式）/ .env
   RESEND_FROM="基智若愚 <noreply@你的網域>"
   ```

> 香港學校 `.edu.hk` 網域的 DNS 通常要找學校 IT / 網管改；記得提早申請，這步常是卡最久的。

驗證完之後，`sendEmail({ to: 'any-student@whatever.com', ... })` 就能寄到任何人。

---

## 3. 退信與送達追蹤（Webhook，未來）

要記「誰退信、誰沒收到」時，加一條 webhook：

1. Resend Dashboard → Webhooks → 建一個，URL 填 `https://你的域名/api/email/webhook`。
2. 在 `src/app/api/email/webhook/route.ts` 收事件，**先驗證 Resend 的 webhook 簽章**（用 Dashboard 給的 webhook secret），再依事件更新 DB。事件種類：
   `sent` / `delivered` / `bounced` / `complained` / `opened` / `clicked` / `failed`
3. `bounced` 的 email 存進「退信黑名單」表，之後 `sendEmail` 前先 skip——保護你的網域信譽（一直寄壞地址會被 Gmail 降評）。

> 這塊還沒做。等有「發信後續追蹤」需求再實作；現階段 v1 只負責把信送出去。

> 🔁 行銷廣播（broadcast）才會用到 Contacts / Audiences / Segments（`resend.contacts.create(...)`、`resend.broadcasts.send(...)`）。**transactional 發信完全不需要**，別誤以為要把學生加進去才能寄。

---

## 4. 模組 API 速查

| 來源 | 用途 |
|---|---|
| `sendEmail(params)` ← `@/lib/email` | 唯一該用的入口。發單封 transactional 信，自動 graceful no-op |
| `resend` ← `@/lib/email` | raw Resend client（可能為 `null`）。批次/排程等未來功能用它，或回 `email.ts` 封高階函式 |
| `WelcomeEmail` 等 ← `@/emails/*` | React Email 模板。新增模板照 `welcome-email.tsx` 的寫法開一支 |

**不要做的事**
- ❌ 不要為了「能寄給學生」去 `resend.contacts.create()` 每個學生——那不是 transactional 發信的機制。
- ❌ 不要在 client component / middleware 呼叫 `sendEmail`（含 API key，只能 server 端）。
- ❌ 不要在 `.ts` 檔直接寫 `<Template />` JSX（用 `.tsx` 或 `createElement`）。

---

## 5. 檔案清單

| 檔案 | 用途 |
|---|---|
| `src/lib/email.ts` | 發信模組（client + `sendEmail` + 檔尾未來擴充註解） |
| `src/emails/welcome-email.tsx` | 範例模板：學生加入班級通知 |
| `.env.example` | `RESEND_API_KEY` / `RESEND_FROM` 範本與說明 |
| `docs/email-service.md` | 本檔 |
