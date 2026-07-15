"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"

type Card = { id: string; front: string; back: string }

export default function DeckPage({ params }: { params: { deckId: string } }) {
  const [cards, setCards] = useState<Card[]>([])
  const [adding, setAdding] = useState(false)
  const [front, setFront] = useState("")
  const [back, setBack] = useState("")

  const fetchCards = useCallback(async () => {
    const res = await fetch(`/api/flashcard-decks/${params.deckId}/cards`)
    if (res.ok) setCards(await res.json())
  }, [params.deckId])

  useEffect(() => { fetchCards() }, [fetchCards])

  const addCard = async () => {
    if (!front.trim() || !back.trim()) return
    const res = await fetch(`/api/flashcard-decks/${params.deckId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front, back }),
    })
    if (res.ok) {
      setFront("")
      setBack("")
      setAdding(false)
      fetchCards()
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/student/flashcards" className="text-gray-400">←</Link>
        <h2 className="font-bold text-lg flex-1">卡片管理</h2>
        <Link
          href={`/student/flashcards/${params.deckId}/review`}
          className="bg-orange-500 text-white px-3 py-1.5 rounded-xl text-sm"
        >
          開始複習
        </Link>
      </div>

      <button
        onClick={() => setAdding(true)}
        className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 text-gray-400 text-sm mb-4 hover:border-blue-300 hover:text-blue-400 transition-colors"
      >
        + 新增卡片
      </button>

      {adding && (
        <div className="bg-white rounded-2xl p-4 border shadow-sm mb-4">
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="正面（問題）"
            rows={2}
            className="w-full border rounded-xl px-3 py-2 text-sm mb-2 resize-none"
          />
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="背面（答案）"
            rows={2}
            className="w-full border rounded-xl px-3 py-2 text-sm mb-3 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={addCard} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm">新增</button>
            <button onClick={() => setAdding(false)} className="flex-1 border py-2 rounded-xl text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {cards.map((card) => (
          <div key={card.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <p className="text-sm font-medium">{card.front}</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600">{card.back}</p>
            </div>
          </div>
        ))}
        {cards.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">尚無卡片，請新增</div>
        )}
      </div>
    </div>
  )
}
