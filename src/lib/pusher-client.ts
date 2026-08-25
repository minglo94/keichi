import Pusher from "pusher-js"

// NEXT_PUBLIC_* values are inlined at BUILD time. If the build ran without
// them, `new Pusher(...)` throws "Options object must provide a cluster",
// which previously took down any page that subscribed without a try/catch.
// Realtime is a progressive enhancement here (every screen also polls or
// loads on mount), so a missing config must degrade quietly, never crash.

let pusherClient: Pusher | null = null
let warned = false

export function getPusherClient(): Pusher | null {
  const key     = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER

  if (!key || !cluster) {
    if (!warned) {
      warned = true
      console.warn(
        "[pusher] NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER missing at build time — realtime updates disabled."
      )
    }
    return null
  }

  if (!pusherClient) {
    try {
      pusherClient = new Pusher(key, { cluster, authEndpoint: "/api/pusher/auth" })
    } catch (err) {
      console.warn("[pusher] client init failed — realtime updates disabled.", err)
      return null
    }
  }
  return pusherClient
}
