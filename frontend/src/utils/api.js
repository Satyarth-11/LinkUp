// Single source of truth for the backend URL.
// VITE_API_URL is baked in at build time from .env.android
// Fallback ensures the app never silently calls a wrong URL.
export const API_BASE = import.meta.env.VITE_API_URL || 'https://linkup-gqtd.onrender.com'

// Retry fetch with timeout — handles Render free tier cold starts (up to 60s)
async function fetchWithRetry(url, options, retries = 3, timeoutMs = 25000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      return res
    } catch (err) {
      clearTimeout(timer)
      const isLastAttempt = attempt === retries
      const isAbort = err.name === 'AbortError'
      if (isLastAttempt) {
        if (isAbort) throw new Error('Server is waking up, please try again in 10 seconds')
        throw new Error('Cannot reach server. Check your internet connection.')
      }
      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
}

export async function apiCall(endpoint, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetchWithRetry(`${API_BASE}/api${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data
}
