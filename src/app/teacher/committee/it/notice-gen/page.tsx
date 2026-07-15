"use client"

import { useState, useEffect } from "react"
import { Upload, FileText, Download, Loader2, Users, Calendar } from "lucide-react"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import { saveAs } from "file-saver" // Note: need to add file-saver or use native blob download

export default function NoticeGenPage() {
  const [file, setFile] = useState<File | null>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState("")
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [noticeData, setNoticeData] = useState({
    title: "家長通知書：校外活動",
    date: new Date().toISOString().split("T")[0],
    teacher: "",
  })

  useEffect(() => {
    fetch("/api/admin/classes")
      .then((res) => res.json())
      .then((data) => setClasses(Array.isArray(data) ? data : []))
  }, [])

  useEffect(() => {
    if (selectedClass) {
      setLoading(true)
      fetch(`/api/classes/${selectedClass}/members`)
        .then((res) => res.json())
        .then((data) => {
          setStudents(Array.isArray(data) ? data : [])
          setLoading(false)
        })
    }
  }, [selectedClass])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const generateNotices = async () => {
    if (!file || students.length === 0) return
    setGenerating(true)

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const content = e.target?.result
        if (!content) return

        // Batch generation or single generation
        // For simplicity, we'll demonstrate a single generation for the first student
        // In a real app, you might want to generate a ZIP of all notices or a single file with page breaks
        
        const zip = new PizZip(content as ArrayBuffer)
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        })

        // Example data for the first student
        const student = students[0]
        const data = {
          ...noticeData,
          studentName: student.name,
          className: classes.find(c => c.id === selectedClass)?.name || "",
        }

        doc.render(data)

        const out = doc.getZip().generate({
          type: "blob",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })

        const fileName = `${noticeData.title}_${student.name}.docx`
        
        // Native blob download if file-saver is not available
        const url = window.URL.createObjectURL(out)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', fileName)
        document.body.appendChild(link)
        link.click()
        link.remove()
        
        setGenerating(false)
      }
      reader.readAsArrayBuffer(file)
    } catch (error) {
      console.error("Error generating notice:", error)
      setGenerating(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-100 rounded-lg">
          <FileText className="w-8 h-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">KCnotice - 家長通知書生成器</h1>
          <p className="text-gray-500 text-sm">從 DOCX 模板快速生成學生通知書</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Step 1: Template Upload */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-gray-400" />
            第一步：上傳模板
          </h2>
          <div 
            className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            <input 
              id="file-upload"
              type="file" 
              className="hidden" 
              accept=".docx"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="flex flex-col items-center">
                <FileText className="w-12 h-12 text-blue-500 mb-2" />
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                <span className="text-xs text-gray-400">點擊更換模板</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="w-12 h-12 text-gray-300 mb-2" />
                <span className="text-sm text-gray-500">上傳 .docx 模板文件</span>
                <span className="text-xs text-gray-400 mt-1">模板中使用 {'{studentName}'}, {'{title}'} 等標籤</span>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Data Configuration */}
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            第二步：選擇對象
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">選擇班別</label>
              <select 
                className="w-full p-2 border rounded-md"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">請選擇...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : students.length > 0 ? (
              <div className="p-3 bg-blue-50 rounded-md text-sm text-blue-700 flex justify-between items-center">
                <span>已找到 {students.length} 位學生</span>
                <span className="text-xs opacity-75">將為名單中第一位學生生成</span>
              </div>
            ) : selectedClass ? (
              <div className="p-3 bg-red-50 rounded-md text-sm text-red-700">該班別暫無學生</div>
            ) : null}
          </div>
        </div>

        {/* Step 3: Global Data */}
        <div className="bg-white p-6 rounded-xl border shadow-sm md:col-span-2">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            第三步：填寫內容
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">通知標題</label>
              <input 
                type="text" 
                className="w-full p-2 border rounded-md"
                value={noticeData.title}
                onChange={(e) => setNoticeData({...noticeData, title: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">通知日期</label>
              <input 
                type="date" 
                className="w-full p-2 border rounded-md"
                value={noticeData.date}
                onChange={(e) => setNoticeData({...noticeData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">負責老師</label>
              <input 
                type="text" 
                className="w-full p-2 border rounded-md"
                placeholder="輸入老師姓名"
                value={noticeData.teacher}
                onChange={(e) => setNoticeData({...noticeData, teacher: e.target.value})}
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={generateNotices}
              disabled={!file || students.length === 0 || generating}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-all ${
                !file || students.length === 0 || generating
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200"
              }`}
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  生成並下載通知書
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      
      <div className="mt-8 bg-amber-50 border border-amber-200 p-4 rounded-lg">
        <h3 className="text-amber-800 font-semibold mb-1 text-sm">提示：關於模板標籤</h3>
        <p className="text-amber-700 text-xs">
          在您的 Word 模板中，可以使用以下標籤，系統將自動替換為實際數據：<br/>
          <code className="bg-white/50 px-1 rounded">{"{title}"}</code> - 通知標題 | 
          <code className="bg-white/50 px-1 rounded">{"{date}"}</code> - 通知日期 | 
          <code className="bg-white/50 px-1 rounded">{"{teacher}"}</code> - 負責老師 | 
          <code className="bg-white/50 px-1 rounded">{"{studentName}"}</code> - 學生姓名 | 
          <code className="bg-white/50 px-1 rounded">{"{className}"}</code> - 班別名稱
        </p>
      </div>
    </div>
  )
}
