import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('linkup_token')
      const storedUser = localStorage.getItem('linkup_user')
      if (storedToken && storedUser) {
        const parsed = JSON.parse(storedUser)
        if (parsed && typeof parsed === 'object') {
          setToken(storedToken)
          setUser(parsed)
        }
      }
    } catch {
      localStorage.removeItem('linkup_token')
      localStorage.removeItem('linkup_user')
    }
    setLoading(false)
  }, [])

  const login = (userData, userToken) => {
    setUser(userData)
    setToken(userToken)
    localStorage.setItem('linkup_token', userToken)
    localStorage.setItem('linkup_user', JSON.stringify(userData))
  }

  const updateUser = (userData) => {
    setUser(userData)
    localStorage.setItem('linkup_user', JSON.stringify(userData))
  }

  const apiUrl = import.meta.env.VITE_API_URL || ''

  const logout = async () => {
    try {
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (_) {}
    setUser(null)
    setToken(null)
    localStorage.removeItem('linkup_token')
    localStorage.removeItem('linkup_user')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
