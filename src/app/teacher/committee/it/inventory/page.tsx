"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Filter, Laptop, Tablet, Projector, MoreHorizontal, History, UserCheck, UserX } from "lucide-react"

type Asset = {
  id: string
  tag: string
  name: string
  type: "IPAD" | "LAPTOP" | "PROJECTOR" | "OTHER"
  status: "AVAILABLE" | "LENT" | "REPAIR" | "RETIRED"
  location?: string
  assignedTo?: {
    id: string
    name: string
    email: string
  }
}

export default function InventoryPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")

  useEffect(() => {
    fetchAssets()
  }, [])

  const fetchAssets = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/assets")
      const data = await res.json()
      setAssets(data)
    } catch (error) {
      console.error("Failed to fetch assets:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(search.toLowerCase()) || 
                          asset.tag.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === "ALL" || asset.type === typeFilter
    return matchesSearch && matchesType
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "AVAILABLE": return "bg-green-100 text-green-700"
      case "LENT": return "bg-blue-100 text-blue-700"
      case "REPAIR": return "bg-orange-100 text-orange-700"
      case "RETIRED": return "bg-gray-100 text-gray-700"
      default: return "bg-gray-100 text-gray-700"
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "LAPTOP": return <Laptop className="w-5 h-5" />
      case "IPAD": return <Tablet className="w-5 h-5" />
      case "PROJECTOR": return <Projector className="w-5 h-5" />
      default: return <MoreHorizontal className="w-5 h-5" />
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">IT 設備管理</h1>
          <p className="text-gray-500">追蹤及管理校內 IT 設施</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-5 h-5" />
          新增設備
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="搜尋名稱或編號..."
              className="pl-10 pr-4 py-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select 
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">所有類型</option>
              <option value="LAPTOP">手提電腦</option>
              <option value="IPAD">iPad</option>
              <option value="PROJECTOR">投影機</option>
              <option value="OTHER">其他</option>
            </select>
            <button className="flex items-center gap-2 border px-3 py-2 rounded-lg hover:bg-gray-50">
              <Filter className="w-5 h-5" />
              進階篩選
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-sm">
              <tr>
                <th className="px-6 py-3 font-medium">設備編號</th>
                <th className="px-6 py-3 font-medium">名稱</th>
                <th className="px-6 py-3 font-medium">類型</th>
                <th className="px-6 py-3 font-medium">狀態</th>
                <th className="px-6 py-3 font-medium">借用人</th>
                <th className="px-6 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">載入中...</td>
                </tr>
              ) : filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">找不到設備</td>
                </tr>
              ) : filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm">{asset.tag}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{asset.name}</div>
                    <div className="text-xs text-gray-500">{asset.location || "未註明位置"}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      {getIcon(asset.type)}
                      <span className="text-sm">{asset.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(asset.status)}`}>
                      {asset.status === "AVAILABLE" ? "可用" : 
                       asset.status === "LENT" ? "已借出" : 
                       asset.status === "REPAIR" ? "維修中" : "已報廢"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {asset.assignedTo ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">
                          {asset.assignedTo.name[0]}
                        </div>
                        <div>{asset.assignedTo.name}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {asset.status === "AVAILABLE" ? (
                        <button title="借出" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                          <UserCheck className="w-5 h-5" />
                        </button>
                      ) : asset.status === "LENT" ? (
                        <button title="還機" className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                          <UserX className="w-5 h-5" />
                        </button>
                      ) : null}
                      <button title="紀錄" className="p-1.5 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <History className="w-5 h-5" />
                      </button>
                      <button title="更多" className="p-1.5 text-gray-600 hover:bg-gray-50 rounded-lg">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
