"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Card = { id: string; front: string; back: string }

const GRADE_LABELS = [
  { grade: 0, label: "完全不記得", color: "bg-red-500 text-white" },
  { grade: 1, label: "有點印象", color: "bg-orange-400 text-white" },
  { grade: 2, label: "記得了", color: "bg-blue-500 text-white" },
  { grade: 3, label: "輕鬆記得", color: "bg-green-500 text-white" },
] as const

export default function ReviewPage({ params }: { params: { deckId: string } }) {
  const router = useRouter()
  const [cards, setCards] = useState<Card[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)
  const [classes, setClasses] = useState<{ id: string }[]>([])

  useEffect(() => {
    fetch(`/api/flashcard-decks/${params.deckId}/due`)
      .then((r) => r.json())
      .then((data: Card[]) => setCards(data))

    fetch("/api/classes")
      .then((r) => r.json())
      .then((data: { id: string }[]) => setClasses(data))
  }, [params.deckId])

  const handleGrade = async (grade: number) => {
    const card = cards[current]
    if (!card) return

    await fetch(`/api/flashcard-decks/${params.deckId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, grade, classId: classes[0]?.id ?? "" }),
    })

    if (current + 1 >= cards.length) {
      // Award points after completing the deck
      if (classes[0]) {
        await fetch(`/api/classes/${classes[0].id}/points`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 20, reason: "FLASHCARD" }),
        })
      }
      setDone(true)
    } else {
      setCurrent((prev) => prev + 1)
      setFlipped(false)
    }
  }

  if (cards.length === 0) {
    return (
      <div className="p-4 text-center py-16">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="font-bold text-lg mb-2">今日無待複習卡片</h2>
        <p className="text-gray-500 text-sm mb-6">所有卡片都已複習完成</p>
        <button onClick={() => router.back()} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl">
          返回
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="p-4 text-center py-16">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="font-bold text-lg mb-2">複習完成！</h2>
        <p className="text-gray-500 text-sm mb-2">共複習 {cards.length} 張卡片</p>
        <p className="text-green-600 font-medium text-sm mb-6">+20 積點已發放</p>
        <button onClick={() => router.back()} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl">
          返回
        </button>
      </div>
    )
  }

  const card = cards[current]

  return (
    <div className="p-4 max-w-md mx-auto">
      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{current + 1} / {cards.length}</span>
          <span>{Math.round(((current) / cards.length) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${(current / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card with flip animation */}
      <div
        className="relative cursor-pointer mb-6"
        style={{ perspective: "1000px", height: "240px" }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className="w-full h-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 bg-white rounded-2xl border shadow-sm flex items-center justify-center p-6 text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-lg font-medium">{card.front}</p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 bg-blue-50 rounded-2xl border border-blue-200 shadow-sm flex items-center justify-center p-6 text-center"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-lg text-blue-800">{card.back}</p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mb-4">
        {flipped ? "評估你的記憶程度" : "點擊翻轉查看答案"}
      </p>

      {flipped && (
        <div className="grid grid-cols-2 gap-2">
          {GRADE_LABELS.map(({ grade, label, color }) => (
            <button
              key={grade}
              onClick={() => handleGrade(grade)}
              className={`py-3 rounded-xl text-sm font-medium ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
