/* Service worker — Web Push only.
 *
 * Deliberately does NOT cache or serve app assets: this app is data-heavy and
 * always online, so an offline cache would mostly risk serving stale pages.
 * Its only job is to receive push events and open the right page on tap.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for existing tabs to close.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "基智行政平台", body: event.data ? event.data.text() : "" }
  }

  const title = data.title || "基智行政平台"
  const options = {
    body:  data.body || "",
    icon:  "/icon.png",
    badge: "/icon.png",
    data:  { link: data.link || "/teacher" },
    // Group by link so a burst (e.g. a broadcast) doesn't stack up.
    tag:   data.link || "keichi-notification",
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || "/teacher"

  // Focus an already-open window if we have one, otherwise open a new one.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(link)
          return client.focus()
        }
      }
      return self.clients.openWindow(link)
    })
  )
})
