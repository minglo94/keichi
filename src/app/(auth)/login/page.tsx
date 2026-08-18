"use client"

import { signIn } from "next-auth/react"
import { LoginForm } from "./LoginForm"
import Image from "next/image"
import { motion } from "framer-motion"
import { ShieldCheck, Users, Megaphone } from "lucide-react"

export default function LoginPage() {
  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left Panel: Branding */}
      <div className="hidden lg:flex relative flex-col items-center justify-center p-12 overflow-hidden bg-blue-950">
        {/* Background Image / Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40 grayscale hover:grayscale-0 transition-all duration-1000"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1523050335392-9ae824979603?q=80&w=2070&auto=format&fit=crop')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/90 via-blue-800/80 to-blue-950/95" />

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center text-white"
        >
          <div className="w-24 h-24 mx-auto bg-white rounded-full flex items-center justify-center mb-6 shadow-2xl ring-4 ring-white/20 p-2">
            <Image src="/logo.png" alt="School Logo" width={80} height={80} priority className="object-contain" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">基智行政平台</h1>
          <p className="text-blue-200 text-lg tracking-widest uppercase font-light">C.C.C. Kei Chi Secondary School</p>
          
          <div className="mt-8 grid grid-cols-1 gap-4 max-w-sm mx-auto">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-4 text-left">
              <ShieldCheck className="w-6 h-6 text-blue-300 shrink-0" />
              <p className="text-sm">安全穩定的教學與行政一體化平台</p>
            </div>
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-4 text-left">
              <Users className="w-6 h-6 text-green-300 shrink-0" />
              <p className="text-sm">支援多位教職員同時協作管理公告</p>
            </div>
          </div>
        </motion.div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 text-xs text-white"
        >
          © 2026 基智行政平台 · 版權所有
        </motion.p>
      </div>

      {/* Right Panel: Login Form */}
      <div className="flex flex-col items-center justify-center p-8 bg-white lg:bg-gray-50">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md space-y-8"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
             <Image src="/logo.png" alt="Logo" width={64} height={64} priority className="mx-auto mb-4" />
             <h2 className="text-2xl font-bold text-gray-900">基智行政平台</h2>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-xl lg:shadow-none border lg:border-none border-gray-100">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">歡迎回來</h2>
              <p className="text-gray-500">請登入您的帳號以進入系統</p>
            </div>

            <LoginForm />

            <div className="mt-8 pt-6 border-t border-gray-100">
              <button
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium text-gray-700"
              >
                <GoogleIcon />
                <span>以 Google 帳號登入</span>
              </button>
            </div>
            
            <p className="mt-6 text-center text-xs text-gray-400">
              遇到問題？請聯繫學校 IT 支援部門
            </p>
            <p className="mt-2 text-center text-xs text-gray-300">
              v0.1.0
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.07-3.71 1.07-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
