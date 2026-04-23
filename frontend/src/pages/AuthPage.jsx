import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiCall } from '../utils/api'
import { getOrCreateKeyPair } from '../utils/crypto'
import { Eye, EyeOff, Zap, Shield, Users, MessageSquare, ArrowRight } from 'lucide-react'

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

      // Generate (or reuse) ECDH keypair and upload public key to server
      try {
        const publicKey = await getOrCreateKeyPair()
        await apiCall('/auth/profile', {
          method: 'PUT',
          body: {
            bio: data.user.bio || '',
            profilePicture: data.user.profilePicture || '',
            interests: data.user.interests || [],
            showActiveStatus: data.user.showActiveStatus !== false,
            publicKey,
          },
        }, data.token)
      } catch (keyErr) {
        console.warn('Key upload failed (non-fatal):', keyErr)
      }

      toast(`Welcome${mode === 'register' ? ' to LinkUp' : ' back'}, ${data.user.username}!`, 'success')
      navigate('/')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: Shield, label: 'End-to-End Encrypted', desc: 'Military-grade password hashing keeps your data safe', color: '#7c3aed' },
    { icon: MessageSquare, label: 'Real-time Messaging', desc: 'Instant delivery via WebSocket connections', color: '#06b6d4' },
    { icon: Users, label: 'Group Rooms', desc: 'Create password-protected rooms for your team', color: '#ec4899' },
    { icon: Zap, label: 'Anonymous Mode', desc: 'Chat with strangers without revealing identity', color: '#f59e0b' },
  ]

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Animated background orbs */}
      <div className="orb-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* ---- Left brand panel ---- */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-[52%] relative z-10">
        <div className="max-w-lg">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 chip mb-6" style={{ borderColor: 'rgba(124,58,237,0.3)', color: 'var(--accent2)' }}>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Secure & Encrypted</span>
            </div>

            <h1 className="text-7xl font-extrabold font-display mb-5 tracking-tight leading-[0.95]">
              <span className="grad-text">Link</span>
              <span className="text-white">Up</span>
            </h1>
            <p className="text-xl leading-relaxed mb-12" style={{ color: 'var(--text-muted)' }}>
              The next generation of secure messaging.<br />
              Private rooms. Anonymous chats. Zero compromises.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {features.map(({ icon: Icon, label, desc, color }, i) => (
              <div
                key={label}
                className={`glass-card p-5 cursor-default animate-slide-up stagger-${i + 1}`}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                >
                  <Icon size={18} style={{ color }} />
                </div>
                <h3 className="font-bold text-sm mb-1 text-white">{label}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Right auth form ---- */}
      <div className="flex-1 flex items-center justify-center px-5 sm:px-8 relative z-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10 animate-fade-in">
            <h1 className="text-5xl font-extrabold font-display mb-2">
              <span className="grad-text">Link</span>
              <span className="text-white">Up</span>
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Secure real-time messaging</p>
          </div>

          <div className="glass-strong rounded-3xl p-8 sm:p-9 animate-slide-up glow">
            {/* Header */}
            <div className="text-center mb-7">
              <h2 className="text-2xl font-bold mb-1">
                {mode === 'login' ? 'Welcome back' : 'Create account'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {mode === 'login' ? 'Sign in to continue your conversations' : 'Join LinkUp in seconds'}
              </p>
            </div>

            {/* Toggle */}
            <div className="flex rounded-xl p-1 mb-7" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid var(--border)' }}>
              {['login', 'register'].map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: mode === m ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--text-muted)',
                    boxShadow: mode === m ? '0 2px 12px rgba(124,58,237,0.3)' : 'none',
                  }}
                >
                  {m === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Username
                </label>
                <input
                  className="inp"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  maxLength={20}
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    className="inp pr-11"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all hover:bg-white/5"
                    style={{ color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {mode === 'register' && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-dim)' }}>Minimum 6 characters</p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-glow w-full mt-2"
                style={{ height: 48, fontSize: 15 }}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2.5">
                    <span className="spinner spinner-sm" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff' }} />
                    {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                  </span>
                ) : (
                  <>
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            <p className="text-center text-sm" style={{ color: 'var(--text-dim)' }}>
              {mode === 'login' ? "New to LinkUp? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="font-bold transition-all hover:underline"
                style={{ color: 'var(--accent2)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {mode === 'login' ? 'Create a free account' : 'Sign in instead'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
