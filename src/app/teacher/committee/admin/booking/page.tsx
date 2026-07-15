"use client"

import { useState, useEffect } from "react"
import { Calendar, Clock, MapPin, Plus, ChevronLeft, ChevronRight, User } from "lucide-react"

type Resource = {
  id: string
  name: string
  type: string
  capacity?: number
}

type Booking = {
  id: string
  resourceId: string
  startTime: string
  endTime: string
  purpose?: string
  user: { name: string }
  resource: Resource
}

export default function BookingPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedResource, setSelectedResource] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(new Date())

  useEffect(() => {
    fetchResources()
    fetchBookings()
  }, [date])

  const fetchResources = async () => {
    try {
      const res = await fetch("/api/resources")
      const data = await res.json()
      setResources(data)
      if (data.length > 0 && !selectedResource) {
        setSelectedResource(data[0].id)
      }
    } catch (error) {
      console.error("Failed to fetch resources:", error)
    }
  }

  const fetchBookings = async () => {
    setLoading(true)
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      
      const res = await fetch(`/api/bookings?start=${start.toISOString()}&end=${end.toISOString()}`)
      const data = await res.json()
      setBookings(data)
    } catch (error) {
      console.error("Failed to fetch bookings:", error)
    } finally {
      setLoading(false)
    }
  }

  const hours = Array.from({ length: 14 }, (_, i) => i + 8) // 8 AM to 9 PM

  const getBookingsForResource = (resourceId: string) => {
    return bookings.filter(b => b.resourceId === resourceId)
  }

  const isTimeOccupied = (resourceId: string, hour: number) => {
    const resourceBookings = getBookingsForResource(resourceId)
    return resourceBookings.find(b => {
      const start = new Date(b.startTime).getHours()
      const end = new Date(b.endTime).getHours()
      return hour >= start && hour < end
    })
  }

  const changeDate = (days: number) => {
    const newDate = new Date(date)
    newDate.setDate(newDate.getDate() + days)
    setDate(newDate)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">校園設施預約</h1>
          <p className="text-gray-500">查看及預約電腦室、特別室及禮堂</p>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus className="w-5 h-5" />
          新增預約
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Resources */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-500" />
              場地選擇
            </h2>
            <div className="space-y-2">
              {resources.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedResource(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedResource === r.id 
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200 border" 
                    : "hover:bg-gray-50 text-gray-600 border border-transparent"
                  }`}
                >
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs opacity-70">{r.type} {r.capacity && `(容納: ${r.capacity})`}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content - Calendar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <div className="flex items-center gap-4">
                <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-100 rounded-full">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="font-bold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  {date.toLocaleDateString("zh-HK", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                </div>
                <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-100 rounded-full">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <button onClick={() => setDate(new Date())} className="text-sm text-indigo-600 font-medium hover:underline">
                回到今天
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {hours.map(hour => {
                  const booking = selectedResource ? isTimeOccupied(selectedResource, hour) : null
                  return (
                    <div key={hour} className="flex border-b last:border-0 h-16 group">
                      <div className="w-20 border-r flex items-center justify-center text-sm text-gray-500 bg-gray-50">
                        <Clock className="w-3 h-3 mr-1" />
                        {hour}:00
                      </div>
                      <div className="flex-1 relative">
                        {booking ? (
                          <div className="absolute inset-1 bg-indigo-100 border-l-4 border-indigo-500 rounded p-2 overflow-hidden">
                            <div className="font-medium text-xs text-indigo-800">{booking.purpose || "已預約"}</div>
                            <div className="text-[10px] text-indigo-600 flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3" />
                              {booking.user.name}
                            </div>
                          </div>
                        ) : (
                          <button className="w-full h-full hover:bg-indigo-50/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="text-xs text-indigo-400 font-medium">+ 點擊預約</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
