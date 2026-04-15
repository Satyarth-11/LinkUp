import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import ChatRoom from './pages/ChatRoom'
import RandomChat from './pages/RandomChat'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-screen mesh-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</p>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/auth" replace />
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/chat/:roomId" element={<PrivateRoute><ChatRoom /></PrivateRoute>} />
          <Route path="/random" element={<PrivateRoute><RandomChat /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
