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
      content: `基智中學
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
      content: `基督教香港崇真會基智中學
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

  console.log("Seed completed: demo accounts + class + todos + committee tools + agent templates created.")
}

main().catch(console.error).finally(() => prisma.$disconnect())
