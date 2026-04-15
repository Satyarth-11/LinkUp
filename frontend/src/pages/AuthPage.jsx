import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiCall } from '../utils/api'
import { Eye, EyeOff, Zap, Shield, Users, MessageSquare } from 'lucide-react'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      toast('Please fill in all fields', 'error'); return
    }
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const data = await apiCall(endpoint, { method: 'POST', body: { username: username.trim(), password } })
      login(data.user, data.token)
      toast(`Welcome${mode === 'register' ? ' to LinkUp' : ' back'}, ${data.user.username}!`, 'success')
      navigate('/')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: Shield, label: 'Encrypted', desc: 'bcrypt password hashing' },
    { icon: MessageSquare, label: 'Real-time', desc: 'Socket.IO messaging' },
    { icon: Users, label: 'Group Chat', desc: 'Password-protected rooms' },
    { icon: Zap, label: 'Anonymous', desc: 'Random stranger chat' },
  ]

  return (
    <div className="min-h-screen mesh-bg flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-1/2">
        <div className="max-w-md">
          <div className="mb-8">
            <h1 className="text-6xl font-bold mb-3">
              <span className="grad-text">Link</span>
              <span style={{ color: 'var(--text)' }}>Up</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 18, lineHeight: 1.6 }}>
              A secure real-time communication platform for private, group, and anonymous conversations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="glass rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon size={16} style={{ color: 'var(--accent2)' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-4xl font-bold">
              <span className="grad-text">Link</span>
              <span style={{ color: 'var(--text)' }}>Up</span>
            </h1>
          </div>

          <div className="glass-strong rounded-2xl p-8 animate-fade-in">
            {/* Toggle */}
            <div className="flex rounded-xl p-1 mb-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              {['login', 'register'].map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: mode === m ? 'linear-gradient(135deg, var(--accent), #5b52f0)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {m === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Username
                </label>
                <input
                  className="inp"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="yourname"
                  autoComplete="username"
                  maxLength={20}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="inp"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {mode === 'register' && (
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>At least 6 characters</p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                style={{ height: 46, marginTop: 8, fontSize: 15, opacity: loading ? 0.7 : 1 }}
                disabled={loading}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </span>
                ) : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-dim)' }}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                style={{ color: 'var(--accent2)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {mode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
