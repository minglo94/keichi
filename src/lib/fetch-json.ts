/**
 * Fetch a JSON array, returning [] on any failure.
 *
 * Guards against a common crash: our API routes return `{ error: "..." }`
 * (not an array) on 401/403/500, so code doing
 *   fetch(url).then(r => r.json()).then(data => data.map(...))
 * blows up with "data.map is not a function" the moment a session expires.
 * Callers get an empty list instead and simply render their empty state.
 */
export async function fetchArray<T = unknown>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
