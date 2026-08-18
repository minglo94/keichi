import type { Metadata } from "next"
import { Inter, Noto_Sans_TC } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/Providers"

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
})

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-sans-tc",
  display: "swap",
})

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
    <html lang="zh-HK" className={`${inter.variable} ${notoSansTC.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <div className="fixed bottom-2 right-2 text-[10px] text-gray-300 pointer-events-none select-none">
          v0.1.0
        </div>
      </body>
    </html>
  )
}
