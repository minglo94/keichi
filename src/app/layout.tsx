import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/components/Providers"

export const metadata: Metadata = {
  title: "基智行政平台",
  description: "教師行政管理平台",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-HK">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <div className="fixed bottom-2 right-2 text-[10px] text-gray-300 pointer-events-none select-none">
          v0.1.0
        </div>
      </body>
    </html>
  )
}
