"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

export function OnboardingTour() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const visited = localStorage.getItem("ichi-visited")
    if (!visited) {
      setShow(true)
    }
  }, [])

  const steps = [
    {
      title: "歡迎來到 基智若愚 ICHI！",
      body: "這是一個專為您設計的學習與行政管理平台。讓我們花 30 秒了解核心功能。",
      icon: "🎓"
    },
    {
      title: "即將行程 · Schedule",
      body: "在您的個人面板中，您可以一目了然地看到即將到來的任務、截止日期和學校活動。",
      icon: "📅"
    },
    {
      title: "今日公告 · News",
      body: "每天早上別忘了查看頂部的公告欄，緊急通知會以紅色閃爍提醒您。",
      icon: "📢"
    },
    {
      title: "準備好開始了嗎？",
      body: "祝您在 ICHI 有個愉快的學習與工作體驗！",
      icon: "🚀"
    }
  ]

  const close = () => {
    localStorage.setItem("ichi-visited", "true")
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-blue-950/40 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -20 }}
          className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-6 border border-white/50"
        >
          <div className="text-6xl">{steps[step].icon}</div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-gray-900">{steps[step].title}</h3>
            <p className="text-gray-500 leading-relaxed">{steps[step].body}</p>
          </div>
          
          <div className="flex gap-2">
            {step > 0 && (
              <button 
                onClick={() => setStep(step - 1)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                上一步
              </button>
            )}
            <button 
              onClick={() => step === steps.length - 1 ? close() : setStep(step + 1)}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
            >
              {step === steps.length - 1 ? "進入系統" : "下一個"}
            </button>
          </div>

          <div className="flex justify-center gap-1.5">
            {steps.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-blue-600' : 'bg-gray-200'}`} />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
