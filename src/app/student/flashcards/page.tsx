"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Deck = {
  id: string
  title: string
  _count: { cards: number }
}

type DueMap = Record<string, number>

export default function FlashcardsPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [dueMap, setDueMap] = useState<DueMap>({})
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")

  const fetchDecks = async () => {
    const res = await fetch("/api/flashcard-decks")
    if (res.ok) {
      const data: Deck[] = await res.json()
      setDecks(data)
      // Fetch due counts
      const counts: DueMap = {}
      await Promise.all(
        data.map(async (deck) => {
          const r = await fetch(`/api/flashcard-decks/${deck.id}/due`)
          if (r.ok) {
            const cards = await r.json()
            counts[deck.id] = cards.length
          }
        })
      )
      setDueMap(counts)
    }
  }

  useEffect(() => { fetchDecks() }, [])

  const createDeck = async () => {
    if (!newTitle.trim()) return
    const res = await fetch("/api/flashcard-decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    })
    if (res.ok) {
      setNewTitle("")
      setCreating(false)
      fetchDecks()
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg">我的閃卡</h2>
        <button
          onClick={() => setCreating(true)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-sm"
        >
          新增牌組
        </button>
      </div>

      {creating && (
        <div className="bg-white rounded-2xl p-4 border shadow-sm mb-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="牌組名稱"
            className="w-full border rounded-xl px-3 py-2 text-sm mb-3"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={createDeck} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm">建立</button>
            <button onClick={() => setCreating(false)} className="flex-1 border py-2 rounded-xl text-sm">取消</button>
          </div>
        </div>
      )}

      {decks.length === 0 ? (
        <div className="text-center text-gray-400 py-12">尚無閃卡牌組，立即建立第一個！</div>
      ) : (
        <div className="space-y-3">
          {decks.map((deck) => (
            <div key={deck.id} className="bg-white rounded-2xl p-4 border shadow-sm flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">{deck.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{deck._count.cards} 張卡片</p>
              </div>
              <div className="flex items-center gap-2">
                {dueMap[deck.id] > 0 && (
                  <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full font-medium">
                    {dueMap[deck.id]} 待複習
                  </span>
                )}
                <Link
                  href={`/student/flashcards/${deck.id}`}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs"
                >
                  管理
                </Link>
                {dueMap[deck.id] > 0 && (
                  <Link
                    href={`/student/flashcards/${deck.id}/review`}
                    className="bg-orange-500 text-white px-3 py-1.5 rounded-xl text-xs"
                  >
                    複習
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
