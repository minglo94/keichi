const BIBLE_QUOTES: { zh: string; en: string; ref: string }[] = [
  {
    zh: "我靠著那加給我力量的，凡事都能做。",
    en: "I can do all things through Christ who strengthens me.",
    ref: "腓立比書 4:13 · Philippians 4:13",
  },
  {
    zh: "你要專心仰賴耶和華，不可倚靠自己的聰明，在你一切所行的事上都要認定他，他必指引你的路。",
    en: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.",
    ref: "箴言 3:5–6 · Proverbs 3:5–6",
  },
  {
    zh: "耶和華是我的力量，是我的盾牌；我心裡倚靠他，就得了幫助。",
    en: "The Lord is my strength and my shield; my heart trusts in him, and he helps me.",
    ref: "詩篇 28:7 · Psalm 28:7",
  },
  {
    zh: "因為我所賜給你們的平安不像世人所賜的，你們心裡不要憂愁，也不要膽怯。",
    en: "Peace I leave with you; my peace I give you. Do not let your hearts be troubled and do not be afraid.",
    ref: "約翰福音 14:27 · John 14:27",
  },
  {
    zh: "應當毫無憂慮，只要凡事藉著禱告、祈求，和感謝，將你們所要的告訴神。",
    en: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.",
    ref: "腓立比書 4:6 · Philippians 4:6",
  },
  {
    zh: "那等候耶和華的必重新得力，他們必如鷹展翅上騰，他們奔跑卻不困倦，行走卻不疲乏。",
    en: "Those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.",
    ref: "以賽亞書 40:31 · Isaiah 40:31",
  },
  {
    zh: "我的恩典夠你用的，因為我的能力是在人的軟弱上顯得完全。",
    en: "My grace is sufficient for you, for my power is made perfect in weakness.",
    ref: "哥林多後書 12:9 · 2 Corinthians 12:9",
  },
  {
    zh: "你們要剛強，不要懼怕！你們的神必來，他必來拯救你們。",
    en: "Be strong, do not fear; your God will come, he will come with vengeance; with divine retribution he will come to save you.",
    ref: "以賽亞書 35:4 · Isaiah 35:4",
  },
  {
    zh: "你要以耶和華為樂，他就將你心裡所求的賜給你。",
    en: "Take delight in the Lord, and he will give you the desires of your heart.",
    ref: "詩篇 37:4 · Psalm 37:4",
  },
  {
    zh: "神愛世人，甚至將他的獨生子賜給他們，叫一切信他的，不至滅亡，反得永生。",
    en: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
    ref: "約翰福音 3:16 · John 3:16",
  },
  {
    zh: "你們要先求他的國和他的義，這些東西都要加給你們了。",
    en: "But seek first his kingdom and his righteousness, and all these things will be given to you as well.",
    ref: "馬太福音 6:33 · Matthew 6:33",
  },
  {
    zh: "愛是恆久忍耐，又有恩慈；愛是不嫉妒，不自誇，不張狂。",
    en: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud.",
    ref: "哥林多前書 13:4 · 1 Corinthians 13:4",
  },
  {
    zh: "凡你手所當做的事，要盡力去做。",
    en: "Whatever your hand finds to do, do it with all your might.",
    ref: "傳道書 9:10 · Ecclesiastes 9:10",
  },
  {
    zh: "耶和華必在你前面行，他必與你同在，必不撇下你，也不丟棄你，不要懼怕，也不要驚惶。",
    en: "The Lord himself goes before you and will be with you; he will never leave you nor forsake you. Do not be afraid; do not be discouraged.",
    ref: "申命記 31:8 · Deuteronomy 31:8",
  },
  {
    zh: "我雖然行過死蔭的幽谷，也不怕遭害，因為你與我同在。",
    en: "Even though I walk through the darkest valley, I will fear no evil, for you are with me.",
    ref: "詩篇 23:4 · Psalm 23:4",
  },
]

function getDailyQuote() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }))
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000)
  return BIBLE_QUOTES[dayOfYear % BIBLE_QUOTES.length]
}

function getGreeting(): string {
  const hour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" })
  ).getHours()
  if (hour < 12) return "早上好"
  if (hour < 18) return "下午好"
  return "晚上好"
}

type Props = {
  name?: string | null
  urgentCount: number
  todayCount: number
}

export function DashboardGreeting({ name, urgentCount, todayCount }: Props) {
  const greeting = getGreeting()
  const firstName = name?.split(" ")[0] ?? "老師"
  const quote = getDailyQuote()

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-caption mb-1" style={{ color: "var(--color-ink-500)" }}>
            歡迎回來
          </p>
          <h1 className="text-h1">
            {greeting}，{firstName}
            {urgentCount > 0 && (
              <span className="ml-3 text-h2 font-semibold" style={{ color: "var(--color-discipline)" }}>
                · {urgentCount} 項待辦緊急
              </span>
            )}
          </h1>
          <p className="mt-1 text-body" style={{ color: "var(--color-ink-500)" }}>
            {urgentCount === 0
              ? "今天一切正常，繼續加油！"
              : `今天共 ${todayCount} 項安排 · ${urgentCount} 項逾期需處理`}
          </p>
        </div>
      </div>

      {/* Daily Bible quote */}
      <div
        className="rounded-xl px-5 py-4 border-l-4 space-y-2"
        style={{
          background: "var(--color-accent-soft)",
          borderLeftColor: "var(--color-accent)",
        }}
      >
        <p className="text-body font-medium leading-relaxed" style={{ color: "var(--color-ink-900)" }}>
          {quote.zh}
        </p>
        <p className="text-caption italic leading-relaxed" style={{ color: "var(--color-ink-700)" }}>
          {quote.en}
        </p>
        <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          {quote.ref}
        </p>
      </div>
    </div>
  )
}
