import type { MetadataRoute } from "next"

// PWA manifest. Required for "Add to Home Screen" — and on iOS, Web Push only
// works for a site installed to the Home Screen, which in turn requires this
// file with display: "standalone".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "基智行政平台",
    short_name:       "基智",
    description:      "教師行政管理平台",
    start_url:        "/teacher",
    display:          "standalone",
    background_color: "#ffffff",
    theme_color:      "#1e3a5f",
    lang:             "zh-HK",
    icons: [
      { src: "/icon.png",       sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  }
}
