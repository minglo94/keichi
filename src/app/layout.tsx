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
  title: "基智若愚 ICHI",
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
      </body>
    </html>
  )
}
