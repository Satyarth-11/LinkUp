import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiCall } from '../utils/api'
import { getSocket, disconnectSocket } from '../utils/socket'
import {
  LogOut, Plus, ArrowRight, Shield, Users, Zap, Copy, Check,
  MessageSquare, Lock, Eye, EyeOff, RefreshCw, Hash, Sparkles, Download
} from 'lucide-react'

function genRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function Dashboard() {
  const { user, token, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('group')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState([])

  const [createRoomId, setCreateRoomId] = useState(genRoomId())
  const [createName, setCreateName] = useState('')
  const [createPass, setCreatePass] = useState('')
  const [copied, setCopied] = useState(false)

  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPass, setJoinPass] = useState('')
  const [targetUser, setTargetUser] = useState('')

  // PWA Install Prompt
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      // Only show banner if user hasn't dismissed it this session
      if (!sessionStorage.getItem('linkup_install_dismissed')) {
        setShowInstallBanner(true)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      toast('LinkUp installed! Find it on your home screen.', 'success')
    }
    setInstallPrompt(null)
    setShowInstallBanner(false)
  }

  const dismissInstall = () => {
    setShowInstallBanner(false)
    sessionStorage.setItem('linkup_install_dismissed', '1')
  }

  useEffect(() => {
    const socket = getSocket(token)
    const handleOnlineUsers = ({ users = [] }) => setOnlineUsers(users)
    socket.on('online_users', handleOnlineUsers)
    if (socket.connected) socket.emit('request_online_users')
    return () => socket.off('online_users', handleOnlineUsers)
  }, [token])

  const copyRoomId = () => {
    navigator.clipboard.writeText(createRoomId)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const handleCreateGroup = async () => {
    if (!createPass.trim()) { toast('Set a room password', 'error'); return }
    setLoading(true)
    try {
      const data = await apiCall('/room/create-group', {
        method: 'POST',
        body: { roomId: createRoomId, name: createName || createRoomId, password: createPass },
      }, token)
      toast(`Room ${data.roomId} created!`, 'success')
      navigate(`/chat/${data.roomId}`)
    } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  const handleJoinGroup = async () => {
    if (!joinRoomId.trim() || !joinPass.trim()) { toast('Enter Room ID and password', 'error'); return }
    setLoading(true)
    try {
      const data = await apiCall('/room/join-group', {
        method: 'POST',
        body: { roomId: joinRoomId.trim(), password: joinPass },
      }, token)
      toast(`Joined ${data.roomId}!`, 'success')
      navigate(`/chat/${data.roomId}`)
    } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  const handlePrivateChat = async () => {
    if (!targetUser.trim()) { toast('Enter a username', 'error'); return }
    if (targetUser.trim().toLowerCase() === user.username) { toast('Cannot chat with yourself', 'error'); return }
    setLoading(true)
    try {
      const data = await apiCall('/room/private', {
        method: 'POST',
        body: { targetUsername: targetUser.trim() },
      }, token)
      navigate(`/chat/${data.roomId}`)
    } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  const handleLogout = () => {
    disconnectSocket()
    logout()
    navigate('/auth')
  }

  const normalizedTargetUser = targetUser.trim().toLowerCase()
  const isTargetOnline = normalizedTargetUser && onlineUsers.includes(normalizedTargetUser)

  const tabs = [
    { id: 'group', label: 'Group', icon: Users, color: '#7c3aed' },
    { id: 'private', label: 'Private', icon: Lock, color: '#06b6d4' },
    { id: 'random', label: 'Random', icon: Zap, color: '#f59e0b' },
  ]

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Background orbs */}
      <div className="orb-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      {/* ---- Header ---- */}
      <header className="glass-strong border-b shrink-0 relative z-10" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-extrabold font-display tracking-tight">
              <span className="grad-text">Link</span><span>Up</span>
            </h1>
            <div className="hidden sm:flex items-center gap-2 chip" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
              <span className="online-dot" style={{ width: 6, height: 6 }} />
              <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>{onlineUsers.length} online</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => navigate('/profile')}
              title="Profile"
              style={{ padding: 0, overflow: 'hidden' }}
            >
              {user?.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt={user.username}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid rgba(255,255,255,0.12)',
                    display: 'block',
                  }}
                />
              ) : (
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), #38bdf8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                    border: '2px solid rgba(255,255,255,0.12)',
                  }}
                >
                  {(user?.username || 'U').charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => navigate('/privacy')} title="Privacy">
              <Shield size={15} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={handleLogout} title="Logout">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ---- Main ---- */}
      <div className="flex-1 flex items-start justify-center px-5 py-10 relative z-10">
        <div className="w-full max-w-xl">
          {/* PWA Install Banner */}
          {showInstallBanner && (
            <div className="install-banner animate-fade-in">
              <div className="flex-1">
                <div className="font-bold text-sm mb-0.5">📱 Install LinkUp</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Get the app for a better experience — works offline!</div>
              </div>
              <div className="flex gap-2">
                <button className="install-btn" onClick={handleInstall}>
                  <span className="flex items-center gap-1.5"><Download size={12} /> Install</span>
                </button>
                <button className="install-dismiss" onClick={dismissInstall}>Later</button>
              </div>
            </div>
          )}

          {/* Hero */}
          <div className="text-center mb-10 animate-fade-in">
            <div className="inline-flex items-center gap-2 chip mb-4" style={{ borderColor: 'rgba(124,58,237,0.3)', color: 'var(--accent2)' }}>
              <Sparkles size={12} />
              Choose your mode
            </div>
            <h2 className="text-4xl sm:text-5xl font-extrabold font-display tracking-tight mb-3">
              Start a <span className="grad-text">Conversation</span>
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Connect with anyone, anywhere, anytime
            </p>
          </div>

          {/* Tab cards */}
          <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up">
            {tabs.map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="glass-card p-4 text-center transition-all"
                style={{
                  borderColor: activeTab === id ? `${color}40` : 'var(--border)',
                  background: activeTab === id ? `${color}10` : undefined,
                  boxShadow: activeTab === id ? `0 4px 20px ${color}15` : 'none',
                  cursor: 'pointer',
                  transform: activeTab === id ? 'translateY(-2px)' : 'none',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
                  style={{
                    background: activeTab === id ? `${color}20` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${activeTab === id ? `${color}40` : 'var(--border)'}`,
                  }}
                >
                  <Icon size={18} style={{ color: activeTab === id ? color : 'var(--text-muted)' }} />
                </div>
                <span className="text-sm font-bold" style={{ color: activeTab === id ? '#fff' : 'var(--text-muted)' }}>
                  {label}
                </span>
              </button>
            ))}
          </div>

          {/* Content card */}
          <div className="glass-strong rounded-3xl p-7 sm:p-8 animate-slide-up stagger-2">

            {/* ===== GROUP ===== */}
            {activeTab === 'group' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                    <Users size={18} style={{ color: '#7c3aed' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Group Chat</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Password-protected group rooms</p>
                  </div>
                </div>
                <hr className="divider" />

                {/* Create */}
                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent2)' }}>Create Room</p>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Room ID</label>
                    <div className="flex gap-2">
                      <div className="inp flex-1 flex items-center font-mono text-base font-bold tracking-[0.2em]" style={{ color: 'var(--accent2)' }}>
                        {createRoomId}
                      </div>
                      <button className="btn btn-ghost btn-icon" onClick={copyRoomId}>
                        {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                      </button>
                      <button className="btn btn-ghost btn-icon" onClick={() => setCreateRoomId(genRoomId())}>
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Name <span className="opacity-40">(optional)</span></label>
                    <input className="inp" placeholder="e.g. Study Group" value={createName} onChange={e => setCreateName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Password</label>
                    <div className="relative">
                      <input className="inp pr-10" type={showPass ? 'text' : 'password'} placeholder="Set a room password" value={createPass} onChange={e => setCreatePass(e.target.value)} />
                      <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <button className="btn btn-glow w-full" style={{ height: 44 }} onClick={handleCreateGroup} disabled={loading}>
                    <Plus size={15} /> Create & Enter
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim)' }}>or join existing</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent2)' }}>Join Room</p>
                  <input className="inp font-mono tracking-wide" placeholder="Room ID (e.g. AB1C2D)" value={joinRoomId} onChange={e => setJoinRoomId(e.target.value.toUpperCase())} maxLength={10} />
                  <input className="inp" type="password" placeholder="Room password" value={joinPass} onChange={e => setJoinPass(e.target.value)} />
                  <button className="btn btn-ghost w-full" style={{ height: 44, borderColor: 'var(--border-hover)' }} onClick={handleJoinGroup} disabled={loading}>
                    <ArrowRight size={15} /> Join Room
                  </button>
                </div>
              </div>
            )}

            {/* ===== PRIVATE ===== */}
            {activeTab === 'private' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
                    <Lock size={18} style={{ color: '#06b6d4' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Private Chat</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Direct 1-on-1 conversations</p>
                  </div>
                </div>
                <hr className="divider" />

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>Username to chat with</label>
                    <input className="inp" placeholder="Enter their username" value={targetUser} onChange={e => setTargetUser(e.target.value)} />
                  </div>
                  {normalizedTargetUser && (
                    <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: isTargetOnline ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isTargetOnline ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` }}>
                      <span className="block w-3 h-3 rounded-full shrink-0" style={{ background: isTargetOnline ? 'var(--success)' : 'var(--text-dim)', boxShadow: isTargetOnline ? '0 0 10px rgba(34,197,94,0.5)' : 'none' }} />
                      <div>
                        <span className="text-sm font-semibold">{normalizedTargetUser}</span>
                        <span className="text-xs ml-2" style={{ color: isTargetOnline ? 'var(--success)' : 'var(--text-dim)' }}>
                          {isTargetOnline ? '● Online now' : '○ Offline'}
                        </span>
                      </div>
                    </div>
                  )}
                  <button className="btn btn-glow w-full" style={{ height: 46 }} onClick={handlePrivateChat} disabled={loading}>
                    <MessageSquare size={15} /> Start Chat
                  </button>
                </div>
              </div>
            )}

            {/* ===== RANDOM ===== */}
            {activeTab === 'random' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <Zap size={18} style={{ color: '#f59e0b' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Random Chat</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Anonymous instant matching</p>
                  </div>
                </div>
                <hr className="divider" />

                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { emoji: '🎭', title: 'Anonymous' },
                    { emoji: '⚡', title: 'Instant' },
                    { emoji: '🔒', title: 'Ephemeral' },
                  ].map(({ emoji, title }) => (
                    <div key={title} className="p-3 rounded-xl text-center" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}>
                      <div className="text-2xl mb-1">{emoji}</div>
                      <div className="text-xs font-semibold">{title}</div>
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-glow w-full"
                  style={{ height: 50, fontSize: 16, background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
                  onClick={() => navigate('/random')}
                >
                  <Zap size={18} /> Find a Stranger
                </button>

                <p className="text-center text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  Messages vanish when both users leave. No traces.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
