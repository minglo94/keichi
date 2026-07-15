import Pusher from "pusher-js"

let pusherClient: Pusher | null = null

export function getPusherClient(): Pusher {
  if (!pusherClient) {
    pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "/api/pusher/auth",
    })
  }
  return pusherClient
}
