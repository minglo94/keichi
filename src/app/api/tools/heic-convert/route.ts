import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

// libheif WASM conversion of large photos can take a while
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file")

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    // sharp's prebuilt binaries can't decode HEIC (HEVC patent licensing) —
    // heic-convert bundles libheif as WASM, which can
    const { default: convert } = await import("heic-convert")
    const output = await convert({ buffer, format: "JPEG", quality: 0.92 })
    const jpeg = Buffer.from(output)

    return new NextResponse(new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), {
      status: 200,
      headers: {
        "Content-Type":   "image/jpeg",
        "Content-Length": String(jpeg.byteLength),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `轉換失敗：${msg}` }, { status: 422 })
  }
}
