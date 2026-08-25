import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Demo accounts
  const teacherPw = await bcrypt.hash("teacher123", 10)
  const adminPw   = await bcrypt.hash("admin123",   10)
  const studentPw = await bcrypt.hash("student123", 10)

  const teacher = await prisma.user.upsert({
    where:  { email: "teacher@demo.hk" },
    update: { password: teacherPw },
    create: { email: "teacher@demo.hk", name: "示範老師", role: "TEACHER", password: teacherPw, emailVerified: new Date() },
  })

  const admin = await prisma.user.upsert({
    where:  { email: "admin@demo.hk" },
    update: { password: adminPw },
    create: { email: "admin@demo.hk", name: "管理員陳老師", role: "ADMIN", password: adminPw, emailVerified: new Date() },
  })

  await prisma.user.upsert({
    where:  { email: "student@demo.hk" },
    update: { password: studentPw },
    create: { email: "student@demo.hk", name: "示範學生", role: "STUDENT", password: studentPw, emailVerified: new Date() },
  })

  // Demo class
  const cls = await prisma.class.upsert({
    where:  { classCode: "DEMO01" },
    update: {},
    create: { name: "4A ICT", classCode: "DEMO01", teacherId: teacher.id },
  })

  // Legacy seed class
  await prisma.class.upsert({
    where:  { classCode: "TEST01" },
    update: {},
    create: { name: "示範班", classCode: "TEST01", teacherId: teacher.id },
  })

  // Sample mission
  const existing = await prisma.mission.findFirst({ where: { classId: cls.id } })
  if (!existing) {
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
  }

  // Sample todos for demo teacher
  await prisma.todo.createMany({
    data: [
      {
        title: "準備下週行政會議議程",
        committee: "ADMIN",
        status: "OPEN",
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
      {
        title: "跟進上月欠交功課名單",
        committee: "DISCIPLINE",
        status: "IN_PROGRESS",
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        createdById: admin.id,
      },
      {
        title: "更新電腦室使用時間表",
        committee: "IT",
        status: "OPEN",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: teacher.id,
      },
    ],
    skipDuplicates: true,
  })

  // PA-announcement (早會廣播) committee-backed categories
  const COMMITTEE_CATEGORIES = [
    { name: "行政",     committee: "ADMIN"      },
    { name: "訓育",     committee: "DISCIPLINE" },
    { name: "資訊科技", committee: "IT"         },
    { name: "課程發展", committee: "CURRICULUM" },
    { name: "課外活動", committee: "ECA"        },
  ] as const
  for (const c of COMMITTEE_CATEGORIES) {
    await prisma.announcementCategory.upsert({
      where:  { name: c.name },
      update: { committee: c.committee },
      create: { name: c.name, committee: c.committee },
    })
  }

  // 「活動文件」與「Quotation」已遷移為站內預設工具，移除舊的嵌入式 (EMBED) DB row。
  // 註：「Quotation」僅存在執行期資料庫（不在程式碼中），此處一併清理。
  await prisma.committeeTool.deleteMany({
    where: { label: { in: ["活動文件", "Quotation"] } },
  })

  // ── Agent document templates ────────────────────────────────────────────────
  const TEMPLATES = [
    {
      docType:   "課程單元計劃",
      name:      "標準課程單元計劃",
      isDefault: true,
      content: `# 課程單元計劃

**科目**：{{subject}}　**班別**：{{class}}　**學年**：{{year}}
**單元名稱**：{{title}}　**課節數**：{{periods}}

## 學習目標
{{objectives}}

## 學習重點
{{keyPoints}}

## 教學活動
| 課節 | 活動內容 | 評估方式 |
|------|----------|----------|
| 1    |          |          |

## 評估
{{assessment}}

## 備注
{{notes}}`,
    },
    {
      docType:   "教學筆記",
      name:      "課堂教學筆記",
      isDefault: true,
      content: `# 教學筆記

**日期**：{{date}}　**班別**：{{class}}　**科目**：{{subject}}

## 今節內容
{{content}}

## 重點詞彙
{{vocabulary}}

## 課堂反思
{{reflection}}`,
    },
    {
      docType:   "學習計劃",
      name:      "個人學習計劃",
      isDefault: true,
      content: `# 個人學習計劃

**學生姓名**：{{student}}　**班別**：{{class}}　**日期**：{{date}}

## 學習目標
{{goals}}

## 每週計劃
{{weeklyPlan}}

## 進度追蹤
{{progress}}`,
    },
    {
      docType:   "試卷",
      name:      "標準試卷格式",
      isDefault: true,
      content: `# {{title}}

**科目**：{{subject}}　**班別**：{{class}}　**日期**：{{date}}
**時間**：{{duration}} 分鐘　**滿分**：{{totalMarks}} 分

---

**考生須知**：請在答題紙上作答。

{{questions}}`,
    },
    {
      docType:   "工作紙",
      name:      "標準工作紙",
      isDefault: true,
      content: `# {{title}} — 工作紙

**姓名**：________________　**班別**：________　**日期**：________________

---

{{instructions}}

{{questions}}`,
    },
    {
      docType:   "報告",
      name:      "標準報告",
      isDefault: true,
      content: `# {{title}}

**日期**：{{date}}　**撰寫人**：{{author}}

## 摘要
{{summary}}

## 內容
{{content}}

## 結論及建議
{{conclusion}}`,
    },
    {
      docType:   "代課通告",
      name:      "內部代課通告",
      isDefault: true,
      content: `中華基督教會基智中學
                                {{date}}
代課安排通告

各位老師：

因 {{absentTeacher}} 老師於 {{date}}（{{dayOfWeek}}）請假，現安排代課如下：

| 節次 | 班別 | 科目 | 代課老師 |
|------|------|------|----------|
{{timetableRows}}

請各代課老師準時就位，謝謝合作。

此致

{{signedBy}}
{{title}}
{{date}}`,
    },
    {
      docType:   "家長通告",
      name:      "標準家長通告",
      isDefault: true,
      content: `中華基督教會基智中學
                                {{date}}
{{noticeTitle}}

各位家長：

{{content}}

如有查詢，請致電學校辦公室。

此致

{{signedBy}}
{{teacherTitle}}
{{date}}`,
    },
    {
      docType:   "採購申請",
      name:      "採購申請表",
      isDefault: true,
      content: `# 採購申請表

**申請日期**：{{date}}　**申請部門**：{{department}}　**申請人**：{{applicant}}

## 採購項目
| 項目 | 規格 | 數量 | 預算（HKD） |
|------|------|------|-------------|
{{items}}

**合計預算**：HKD {{totalBudget}}

## 申購原因
{{reason}}

## 簽署
申請人：________________　日期：________________
批准人：________________　日期：________________`,
    },
    {
      docType:   "活動報名表",
      name:      "標準活動報名表",
      isDefault: true,
      content: `# {{activityName}} 報名表

**活動日期**：{{date}}　**地點**：{{venue}}　**費用**：HKD {{fee}}

## 學生資料
**姓名**：________________　**班別**：________　**學號**：________

## 家長同意
本人同意 ________________（學生姓名）參加上述活動。

家長簽署：________________　日期：________________
聯絡電話：________________`,
    },
    {
      docType:   "會議記錄",
      name:      "標準會議記錄",
      isDefault: true,
      content: `# {{meetingTitle}} — 會議記錄

**日期**：{{date}}　**時間**：{{time}}　**地點**：{{venue}}

**出席者**：{{attendees}}
**缺席者**：{{absent}}
**主席**：{{chair}}　**記錄**：{{secretary}}

## 議程
{{agenda}}

## 討論事項及決議
{{discussion}}

## 行動項目
| 事項 | 負責人 | 完成日期 |
|------|--------|----------|
{{actionItems}}

## 下次會議
**日期**：{{nextDate}}　**時間**：{{nextTime}}`,
    },
    {
      docType:   "活動計劃",
      name:      "活動策劃書",
      isDefault: true,
      content: `# {{activityName}} — 活動計劃書

**日期**：{{date}}　**地點**：{{venue}}　**主辦**：{{organizer}}

## 活動目的
{{purpose}}

## 對象及人數
{{participants}}

## 活動流程
| 時間 | 內容 | 負責人 |
|------|------|--------|
{{schedule}}

## 所需資源
{{resources}}

## 預算
{{budget}}`,
    },
    {
      docType:   "分析報告",
      name:      "數據分析報告",
      isDefault: true,
      content: `# {{title}} — 分析報告

**日期**：{{date}}　**分析員**：{{analyst}}

## 數據概覽
{{overview}}

## 主要發現
{{findings}}

## 圖表
{{charts}}

## 建議
{{recommendations}}`,
    },
    {
      docType:   "其他",
      name:      "通用文件",
      isDefault: true,
      content: `# {{title}}

**日期**：{{date}}

{{content}}`,
    },
  ]

  for (const tpl of TEMPLATES) {
    await prisma.agentTemplate.upsert({
      where:  { id: `seed-${tpl.docType}` },
      update: { name: tpl.name, content: tpl.content, isDefault: tpl.isDefault },
      create: { id: `seed-${tpl.docType}`, ...tpl },
    })
  }

  // ── 提示詞庫 (Prompt Library) — built-in prompts, ported from
  // github.com/minglo94/aiteacher. createdById stays null ("system" prompt,
  // ADMIN-only edit). update:{} so re-seeding never clobbers an admin's edits.
  const PROMPT_SEED: {
    id: string
    subject: "LESSON" | "MATERIAL" | "ASSESSMENT" | "FEEDBACK" | "PARENT" | "CLASSROOM" | "ADMIN" | "PD"
    type: "PLAN" | "CREATE" | "ASSESS" | "COMMUNICATE"
    title: string
    tags: string[]
    promptText: string
  }[] = [
    {
      id: "lesson-plan", subject: "LESSON", type: "PLAN",
      title: "設計完整教案",
      tags: ["教案", "學習目標", "課堂活動", "評估"],
      promptText: `請為以下課堂設計完整教案：
科目：【在此填上科目】年級：【在此填上年級】
課題：【在此填上課題名稱】課時：【在此填上課堂時間（分鐘）】
學習目標：【在此填上學習目標】
請包含：引入活動、主要教學內容、課堂活動及評估方式。`,
    },
    {
      id: "lesson-bloom", subject: "LESSON", type: "PLAN",
      title: "高層次思維提問設計",
      tags: ["布魯姆分類法", "課堂提問", "高階思維", "批判思考"],
      promptText: `請按布魯姆分類法為以下課題設計課堂提問：
科目：【在此填上科目】課題：【在此填上課題名稱】年級：【在此填上年級】
請涵蓋記憶、理解、應用、分析、評鑑、創造六個層次，每層2-3條。`,
    },
    {
      id: "material-worksheet", subject: "MATERIAL", type: "CREATE",
      title: "設計學習工作紙",
      tags: ["工作紙", "練習題", "差異化", "鞏固概念"],
      promptText: `請設計一份學習工作紙：
科目：【在此填上科目】年級：【在此填上年級】
課題：【在此填上課題名稱】
目的：【在此填上目的（鞏固概念/預習/延伸練習）】
能力程度：【在此填上能力水平（基礎/中等/進階）】
請包含：說明、練習題、思考問題。`,
    },
    {
      id: "material-differentiation", subject: "MATERIAL", type: "CREATE",
      title: "差異化學習活動",
      tags: ["差異化教學", "因材施教", "高能力", "學習支援"],
      promptText: `請為以下課題設計差異化教學活動：
科目：【在此填上科目】年級：【在此填上年級】
課題：【在此填上課題名稱】
班級情況：【在此填上班級特點】
請分別為高能力、中等、需要支援的學生，提供不同活動建議。`,
    },
    {
      id: "assessment-quiz", subject: "ASSESSMENT", type: "ASSESS",
      title: "設計測驗題目",
      tags: ["測驗", "選擇題", "問答題", "評分標準"],
      promptText: `請為以下課題設計測驗題目：
科目：【在此填上科目】年級：【在此填上年級】
課題：【在此填上課題名稱】
題型：【在此填上題型（選擇題/填充題/問答題/混合）】
題目數量：【在此填上數量】
難度分佈：【在此填上難度要求（例：容易30%，中等50%，困難20%）】
請附答案及評分標準。`,
    },
    {
      id: "assessment-rubric", subject: "ASSESSMENT", type: "ASSESS",
      title: "設計評分準則 (Rubric)",
      tags: ["Rubric", "評分準則", "評估維度", "等級描述"],
      promptText: `請為以下評估任務設計詳細的評分準則：
科目：【在此填上科目】
評估任務：【在此填上評估任務描述】
年級：【在此填上年級】最高分：【在此填上總分】
評估維度：【在此填上評估方面（內容/語言/結構/創意等）】`,
    },
    {
      id: "assessment-errors", subject: "ASSESSMENT", type: "ASSESS",
      title: "分析學生常見錯誤",
      tags: ["錯誤分析", "補救教學", "學習困難", "教學策略"],
      promptText: `請幫我分析以下學生作品中的常見錯誤並提出教學建議：
科目：【在此填上科目】年級：【在此填上年級】
評估任務：【在此填上任務說明】
典型錯誤例子：【在此填上學生的典型錯誤】
請分類錯誤類型、分析原因並建議補救教學策略。`,
    },
    {
      id: "feedback-report", subject: "FEEDBACK", type: "COMMUNICATE",
      title: "撰寫學習報告評語",
      tags: ["評語", "學習報告", "正面語氣", "建設性反饋"],
      promptText: `請為以下學生撰寫學習報告評語（約80-100字，繁體中文）：
學生特點及表現：【在此填上學習特點和表現】
需改進的地方：【在此填上需改進方面】
建議：【在此填上給家長/學生的建議】
請以正面、建設性語氣，先表揚再提改善建議。`,
    },
    {
      id: "parent-notice", subject: "PARENT", type: "COMMUNICATE",
      title: "撰寫家長通告",
      tags: ["家長通告", "正式文書", "活動通知", "回條"],
      promptText: `請撰寫一份家長通告（繁體中文，正式語氣）：
事項名稱：【在此填上活動或事項名稱】
日期及時間：【在此填上日期和時間】
地點/方式：【在此填上地點或進行方式】
家長需配合事項：【在此填上家長需要做的事】
截止日期：【在此填上回條截止日期（如適用）】`,
    },
    {
      id: "admin-minutes", subject: "ADMIN", type: "PLAN",
      title: "整理會議記錄",
      tags: ["會議記錄", "議題", "決議", "跟進事項"],
      promptText: `請將以下會議記錄整理成正式格式：
會議名稱：【在此填上會議名稱】
日期及時間：【在此填上日期和時間】
出席人士：【在此填上出席者名單】
原始記錄：【在此填上流水帳記錄內容】
請整理成：議題、討論內容、決議、跟進事項的格式。`,
    },
    {
      id: "admin-email", subject: "ADMIN", type: "COMMUNICATE",
      title: "草擬電郵/信件",
      tags: ["電郵", "信件", "正式溝通", "語氣"],
      promptText: `請幫我撰寫以下用途的電郵或信件（繁體中文）：
收件人：【在此填上收件人（家長/校長/同事/外部機構）】
事由：【在此填上電郵/信件目的】
主要內容要點：【在此填上需要表達的主要內容】
語氣：【在此填上語氣要求（正式/親切/跟進/感謝）】`,
    },
    {
      id: "admin-annual-plan", subject: "ADMIN", type: "PLAN",
      title: "撰寫周年計劃關注事項報告",
      tags: ["周年計劃", "關注事項", "成就", "反思", "持分者問卷", "APASO"],
      promptText: `現在請你為以下關注事項填寫「成就」、「反思」及「回饋與跟進」三個部分。

【格式參考（上年報告）】
【在此填上上年關注事項報告的格式範例或段落】

【中期報告內容】
【在此填上本年中期報告的相關內容】

【Word 補充資料】
【在此填上Word文件中的補充說明資料】

【APASO 問卷數據】
【在此填上APASO問卷的相關數據結果】

【學校關注事項問卷數據】
【在此填上學校關注事項問卷的相關數據結果】

【持分者問卷數據】
【在此填上持分者問卷的相關數據結果】

撰寫要求：
1. 格式須與上年報告一致。
2. 內容完全根據上述提供的資料撰寫，不可自行增添未有數據支持的內容。
3. 在「成就」部分的結論中，視乎適用性，盡量涵蓋以下關鍵詞：國民及全球公民身份認同、寬闊的知識基礎、語文能力、共通能力、資訊素養、生涯規劃。
4. 引用數據時請具體說明來源（如 APASO、持分者問卷等）及數值。`,
    },
    {
      id: "pd-reflection", subject: "PD", type: "PLAN",
      title: "引導教學反思",
      tags: ["教學反思", "專業成長", "改善建議", "教學策略"],
      promptText: `請根據以下情況幫我進行教學反思並提出改善建議：
科目及年級：【在此填上科目和年級】
課堂目標：【在此填上本課目標】
課堂情況：【在此填上課堂過程描述】
困難或挑戰：【在此填上遇到的困難】
請提供：優點肯定、改善建議、下次可嘗試的策略。`,
    },
  ]

  for (const p of PROMPT_SEED) {
    await prisma.prompt.upsert({
      where:  { id: p.id },
      update: {},
      create: { ...p, createdById: null },
    })
  }

  console.log("Seed completed: demo accounts + class + todos + committee tools + agent templates + prompt library created.")
}

main().catch(console.error).finally(() => prisma.$disconnect())
