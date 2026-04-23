// Single source of truth for the backend URL.
// VITE_API_URL is baked in at build time from .env.android
// Fallback ensures the app never silently calls a wrong URL.
export const API_BASE = import.meta.env.VITE_API_URL || 'https://linkup-gqtd.onrender.com'

export async function apiCall(endpoint, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/api${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data
}
