import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { pusherServer } from "@/lib/pusher"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.text()
  const params = new URLSearchParams(body)
  const socketId = params.get("socket_id")!
  const channelName = params.get("channel_name")!

  // Security: users can only subscribe to their own private channel
  const allowedChannel = `private-user-${session.user.id}`
  if (channelName !== allowedChannel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const authResponse = pusherServer.authorizeChannel(socketId, channelName)
  return NextResponse.json(authResponse)
}
