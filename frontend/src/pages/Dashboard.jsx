import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiCall } from '../utils/api'
import {
  LogOut, Plus, ArrowRight, Shield, Users, Zap, Copy, Check,
  MessageSquare, Lock, Eye, EyeOff, RefreshCw
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

  // Group create state
  const [createRoomId, setCreateRoomId] = useState(genRoomId())
  const [createName, setCreateName] = useState('')
  const [createPass, setCreatePass] = useState('')
  const [copied, setCopied] = useState(false)

  // Group join state
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinPass, setJoinPass] = useState('')

  // Private chat state
  const [targetUser, setTargetUser] = useState('')

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
    } catch (err) {
      toast(err.message, 'error')
    } finally { setLoading(false) }
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
    } catch (err) {
      toast(err.message, 'error')
    } finally { setLoading(false) }
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
    } catch (err) {
      toast(err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleLogout = () => { logout(); navigate('/auth') }

  const tabs = [
    { id: 'group', label: 'Group Chat', icon: Users },
    { id: 'private', label: 'Private Chat', icon: Lock },
    { id: 'random', label: 'Random Chat', icon: Zap },
  ]

  return (
    <div className="min-h-screen mesh-bg flex flex-col">
      {/* Header */}
      <header className="glass-strong border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              <span className="grad-text">Link</span>
              <span style={{ color: 'var(--text)' }}>Up</span>
            </h1>
            <span className="chip" style={{ fontSize: 11 }}>
              <span className="online-dot" />
              <span style={{ color: 'var(--success)' }}>Online</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              👤 {user?.username}
            </span>
            <button className="btn btn-ghost btn-icon" onClick={handleLogout} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="text-center mb-10 animate-fade-in">
            <div className="inline-flex items-center gap-2 chip mb-4" style={{ borderColor: 'rgba(108,99,255,0.3)', color: 'var(--accent2)' }}>
              <Shield size={12} />
              End-to-end encrypted · Real-time · Persistent
            </div>
            <h2 className="text-4xl font-bold mb-3" style={{ color: 'var(--text)' }}>
              Start a Conversation
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>
              Choose your communication mode below
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: activeTab === id ? 'linear-gradient(135deg, var(--accent), #5b52f0)' : 'transparent',
                  color: activeTab === id ? '#fff' : 'var(--text-muted)',
                }}
              >
                <Icon size={14} /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Card */}
          <div className="glass-strong rounded-2xl p-8 animate-slide-up">

            {/* ===== GROUP CHAT ===== */}
            {activeTab === 'group' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={18} style={{ color: 'var(--accent2)' }} />
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Group Chat</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    Create or join a password-protected group room. Multiple users can chat together.
                  </p>
                </div>
                <hr className="divider" />

                {/* Create */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    Create a Room
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 5 }}>Room ID (share this)</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div className="inp flex-1" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em', fontWeight: 700, color: 'var(--accent2)', fontSize: 16, display: 'flex', alignItems: 'center' }}>
                          {createRoomId}
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={copyRoomId} title="Copy">
                          {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => setCreateRoomId(genRoomId())} title="Generate new">
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 5 }}>Room Name (optional)</label>
                      <input className="inp" placeholder="e.g. Study Group, Dev Team..." value={createName} onChange={e => setCreateName(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 5 }}>Room Password</label>
                      <div style={{ position: 'relative' }}>
                        <input className="inp" type={showPass ? 'text' : 'password'} placeholder="Set a password for the room" value={createPass} onChange={e => setCreatePass(e.target.value)} style={{ paddingRight: 40 }} />
                        <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <button className="btn btn-primary w-full" style={{ height: 44 }} onClick={handleCreateGroup} disabled={loading}>
                      <Plus size={16} /> Create & Enter Room
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>or join existing</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                {/* Join */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    Join a Room
                  </p>
                  <div className="space-y-3">
                    <input className="inp" placeholder="Room ID (e.g. AB1C2D)" value={joinRoomId} onChange={e => setJoinRoomId(e.target.value.toUpperCase())} maxLength={10} style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }} />
                    <input className="inp" type="password" placeholder="Room password" value={joinPass} onChange={e => setJoinPass(e.target.value)} />
                    <button className="btn btn-ghost w-full" style={{ height: 44, borderColor: 'var(--border-hover)', color: 'var(--text)' }} onClick={handleJoinGroup} disabled={loading}>
                      <ArrowRight size={16} /> Join Room
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===== PRIVATE CHAT ===== */}
            {activeTab === 'private' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Lock size={18} style={{ color: 'var(--accent2)' }} />
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Private Chat</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    Start a one-on-one private conversation with another registered user. Only the two of you can access this room.
                  </p>
                </div>
                <hr className="divider" />

                <div className="space-y-4">
                  <div style={{ padding: 14, borderRadius: 12, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)' }}>
                    <p style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 4, fontWeight: 600 }}>You are: {user?.username}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>A dedicated private room will be created (or resumed) between you and the target user.</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 5 }}>Chat with (username)</label>
                    <input className="inp" placeholder="Enter their username..." value={targetUser} onChange={e => setTargetUser(e.target.value)} />
                  </div>
                  <button className="btn btn-primary w-full" style={{ height: 46 }} onClick={handlePrivateChat} disabled={loading}>
                    <MessageSquare size={16} /> Start Private Chat
                  </button>
                </div>
              </div>
            )}

            {/* ===== RANDOM CHAT ===== */}
            {activeTab === 'random' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap size={18} style={{ color: 'var(--accent2)' }} />
                    <h3 style={{ fontWeight: 700, fontSize: 18 }}>Random Anonymous Chat</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    Get paired with a random stranger instantly. No names, no traces — just conversation.
                  </p>
                </div>
                <hr className="divider" />

                <div className="space-y-4">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { emoji: '🎭', title: 'Anonymous', desc: 'No identity shared' },
                      { emoji: '⚡', title: 'Instant', desc: 'Matched in seconds' },
                      { emoji: '🔒', title: 'Private', desc: 'Chat disappears on leave' },
                      { emoji: '🌍', title: 'Open', desc: 'No account needed to pair' },
                    ].map(({ emoji, title, desc }) => (
                      <div key={title} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>{emoji}</div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="btn btn-primary w-full"
                    style={{ height: 50, fontSize: 16, background: 'linear-gradient(135deg, #6c63ff, #38bdf8)' }}
                    onClick={() => navigate('/random')}
                  >
                    <Zap size={18} /> Find a Random Stranger
                  </button>

                  <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
                    Random chats are not stored in the database. Messages disappear when both users leave.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
