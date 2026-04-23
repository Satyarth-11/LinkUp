import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import ChatRoom from './pages/ChatRoom'
import RandomChat from './pages/RandomChat'
import ProfilePage from './pages/ProfilePage'
import PrivacySettings from './pages/PrivacySettings'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-screen mesh-bg flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="spinner spinner-lg text-brand mx-auto" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
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
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/privacy" element={<PrivateRoute><PrivacySettings /></PrivateRoute>} />
          <Route path="/chat/:roomId" element={<PrivateRoute><ChatRoom /></PrivateRoute>} />
          <Route path="/random" element={<PrivateRoute><RandomChat /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
