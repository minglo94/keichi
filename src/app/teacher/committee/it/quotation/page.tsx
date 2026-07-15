"use client"

import { useState } from "react"
import { ShoppingCart, Plus, Search, FileText, Camera, Loader2, CheckCircle2 } from "lucide-react"

export default function QuotationPage() {
  const [quotations, setQuotations] = useState([
    { id: 1, title: "Dell Laptops for IT Lab", vendor: "Dell Hong Kong", amount: 45000, date: "2024-05-10", status: "Pending" },
    { id: 2, title: "iPad Air 256GB x 10", vendor: "Apple Store", amount: 52000, date: "2024-05-12", status: "Approved" },
    { id: 3, title: "STEM Kit Upgrades", vendor: "STEM World", amount: 12500, date: "2024-05-15", status: "Draft" },
  ])

  const [isUploading, setIsUploading] = useState(false)
  const [ocrResult, setOcrResult] = useState<any>(null)

  const handleOcr = async (file: File) => {
    setIsUploading(true)
    // In a real implementation, we would:
    // 1. Upload the image to a server (or send as base64)
    // 2. Call an AI endpoint (like /api/ai/ocr-quotation)
    // 3. Receive structured JSON
    
    // Simulating OCR delay
    setTimeout(() => {
      setOcrResult({
        vendor: "Extracted Vendor Name",
        totalAmount: 1234.50,
        items: ["Item 1", "Item 2"],
        date: "2024-05-17"
      })
      setIsUploading(false)
    }, 2000)
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-100 rounded-lg">
            <ShoppingCart className="w-8 h-8 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">KCquotation - 採購報價管理</h1>
            <p className="text-gray-500 text-sm">追蹤及分析學校採購報價單</p>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
          <Plus className="w-5 h-5" />
          新增報價
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Statistics or Actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h2 className="font-semibold text-gray-700">報價列表</h2>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="搜尋報價或供應商..." 
                  className="pl-9 pr-4 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-500 text-xs uppercase font-medium">
                    <th className="px-6 py-3">報價標題</th>
                    <th className="px-6 py-3">供應商</th>
                    <th className="px-6 py-3">金額</th>
                    <th className="px-6 py-3">日期</th>
                    <th className="px-6 py-3">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {quotations.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-6 py-4 font-medium text-gray-900">{q.title}</td>
                      <td className="px-6 py-4 text-gray-600">{q.vendor}</td>
                      <td className="px-6 py-4 font-mono text-purple-600">${q.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-gray-500">{q.date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          q.status === 'Approved' ? 'bg-green-100 text-green-700' :
                          q.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {q.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* AI OCR Section */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-sm p-6 border-purple-100 bg-purple-50/30">
            <h2 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
              <Camera className="w-5 h-5" />
              AI 智能識別 (OCR)
            </h2>
            <p className="text-xs text-purple-700 mb-4">
              上傳報價單照片或 PDF，AI 將自動提取供應商、金額及項目明細。
            </p>
            
            <div 
              className="border-2 border-dashed border-purple-200 rounded-lg p-6 text-center hover:bg-purple-50 transition-colors cursor-pointer mb-4"
              onClick={() => document.getElementById('ocr-upload')?.click()}
            >
              <input 
                id="ocr-upload" 
                type="file" 
                className="hidden" 
                onChange={(e) => e.target.files?.[0] && handleOcr(e.target.files[0])}
              />
              {isUploading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-2" />
                  <span className="text-sm font-medium text-purple-700">正在處理中...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Camera className="w-10 h-10 text-purple-300 mb-2" />
                  <span className="text-sm text-purple-600">拍攝或上傳報價單</span>
                </div>
              )}
            </div>

            {ocrResult && (
              <div className="bg-white p-4 rounded-lg border border-purple-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-green-600 font-bold text-sm mb-3">
                  <CheckCircle2 className="w-4 h-4" />
                  識別成功
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">供應商:</span>
                    <span className="font-medium">{ocrResult.vendor}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">總金額:</span>
                    <span className="font-bold text-purple-600">${ocrResult.totalAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">日期:</span>
                    <span className="font-medium">{ocrResult.date}</span>
                  </div>
                </div>
                <button className="w-full mt-4 bg-purple-600 text-white py-2 rounded text-xs font-bold hover:bg-purple-700">
                  導入至系統
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-4">
            <h3 className="font-semibold text-sm mb-3 text-gray-700">採購小貼士</h3>
            <ul className="text-xs text-gray-500 space-y-2 list-disc pl-4">
              <li>超過 $5,000 的採購需至少三份報價。</li>
              <li>所有報價單必須包含公司印章及有效期。</li>
              <li>IT 設備建議優先選取政府合約供應商。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
