"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Provider = "anthropic" | "openrouter" | "local"

type Settings = {
  provider: Provider
  model:    string
  baseUrl:  string
  defaults: Record<Provider, string>
  keys:     { anthropic: boolean; openrouter: boolean }
}

const PROVIDER_META: Record<Provider, { label: string; hint: string; needsKeyEnv?: string }> = {
  anthropic:  { label: "Anthropic（Claude）", hint: "官方 Claude API，最穩定。", needsKeyEnv: "ANTHROPIC_API_KEY" },
  openrouter: { label: "OpenRouter",           hint: "一個 API key 用多款模型（GPT、Claude、Llama…）。", needsKeyEnv: "OPENROUTER_API_KEY" },
  local:      { label: "本地 / 自架 LLM",       hint: "OpenAI 相容伺服器（Ollama / LM Studio），資料唔出校。" },
}

export default function AdminSettingsPage() {
  const [s,        setS]        = useState<Settings | null>(null)
  const [provider, setProvider] = useState<Provider>("anthropic")
  const [model,    setModel]    = useState("")
  const [baseUrl,  setBaseUrl]  = useState("")
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [err,      setErr]      = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/llm-settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d: Settings | null) => {
        if (!d) { setErr("僅管理員可存取。"); return }
        setS(d); setProvider(d.provider); setModel(d.model); setBaseUrl(d.baseUrl || "")
      })
      .finally(() => setLoading(false))
  }, [])

  function pick(p: Provider) {
    setProvider(p)
    // Offer the provider's default model when switching (only if empty/other default).
    if (s && (!model || Object.values(s.defaults).includes(model))) setModel(s.defaults[p])
  }

  async function save() {
    setSaving(true); setErr(null); setSaved(false)
    const res = await fetch("/api/admin/llm-settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model: model || undefined, baseUrl: provider === "local" ? baseUrl : undefined }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    else { const d = await res.json().catch(() => ({})); setErr(d?.error ?? `儲存失敗 (${res.status})`) }
  }

  const keyConfigured = s
    ? (provider === "anthropic" ? s.keys.anthropic : provider === "openrouter" ? s.keys.openrouter : true)
    : true

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 老師主頁</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">系統設定</h1>
      </div>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        選擇 AI 供應商。Keida 助理及所有 AI 功能都會使用呢個設定。
      </p>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : err && !s ? (
        <div className="card p-8 text-center" style={{ color: "var(--color-ink-400)" }}>{err}</div>
      ) : s && (
        <div className="card p-5 space-y-5">
          <h3 className="text-h3">AI 供應商</h3>

          {/* Provider picker */}
          <div className="space-y-2">
            {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
              <button key={p} onClick={() => pick(p)}
                className="w-full text-left p-3 rounded-input border transition-colors"
                style={{
                  border: `1px solid ${provider === p ? "var(--color-accent)" : "var(--color-border)"}`,
                  background: provider === p ? "var(--color-accent-soft, #eff6ff)" : "var(--color-surface)",
                }}>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: provider === p ? "var(--color-accent)" : "transparent", border: `2px solid ${provider === p ? "var(--color-accent)" : "var(--color-ink-300)"}` }} />
                  <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{PROVIDER_META[p].label}</span>
                </div>
                <p className="text-caption mt-1 ml-5" style={{ color: "var(--color-ink-500)" }}>{PROVIDER_META[p].hint}</p>
              </button>
            ))}
          </div>

          {/* Model */}
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>模型名稱</label>
            <input value={model} onChange={(e) => setModel(e.target.value)}
              placeholder={s.defaults[provider]} className={inputCls} style={inputStyle} />
            <p className="text-[11px] mt-1" style={{ color: "var(--color-ink-400)" }}>
              留空則用預設：<code>{s.defaults[provider]}</code>
            </p>
          </div>

          {/* Local base URL */}
          {provider === "local" && (
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>伺服器網址（OpenAI 相容）</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:1234/v1" className={inputCls} style={inputStyle} />
            </div>
          )}

          {/* Key status */}
          {PROVIDER_META[provider].needsKeyEnv && (
            <div className="p-3 rounded-input text-caption" style={{
              background: keyConfigured ? "var(--color-curriculum)15" : "var(--color-admin-soft, #fff7ed)",
              color:      keyConfigured ? "var(--color-curriculum)"   : "var(--color-admin, #b45309)",
            }}>
              {keyConfigured
                ? `✓ 已設定 ${PROVIDER_META[provider].needsKeyEnv} 金鑰`
                : `⚠ 未設定金鑰。請於伺服器環境變數加入 ${PROVIDER_META[provider].needsKeyEnv}（為安全起見，金鑰只存於伺服器，唔會經此頁儲存）。`}
            </div>
          )}
          {provider === "local" && (
            <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
              本地 LLM 通常唔需要金鑰；如需要可設 LOCAL_LLM_API_KEY 環境變數。
            </p>
          )}

          {err && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>{err}</p>}

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="px-4 py-2 text-body font-medium rounded-input text-white"
              style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>
              {saving ? "儲存中…" : "儲存設定"}
            </button>
            {saved && <span className="text-caption" style={{ color: "var(--color-curriculum)" }}>✓ 已儲存，立即生效</span>}
          </div>
        </div>
      )}
    </div>
  )
}
