import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

const schema = z.object({
  imageBase64: z.string().min(1),
  mimeType:    z.string().default("image/jpeg"),
})

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { imageBase64, mimeType } = schema.parse(await req.json())

  const message = await client.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: 2000,
    system:     "你是一個 OCR 文字提取工具。請提取圖片中所有可見的文字，保留原始排版結構（換行、段落）。若文字是繁體中文，請使用繁體中文輸出。只輸出提取到的文字，不要加任何說明或前言。",
    messages: [
      {
        role:    "user",
        content: [
          {
            type:   "image",
            source: {
              type:       "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data:       imageBase64,
            },
          },
          { type: "text", text: "請提取此圖片中的所有文字。" },
        ],
      },
    ],
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return NextResponse.json({ text })
}
