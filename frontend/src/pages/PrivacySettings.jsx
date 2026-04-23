import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiCall } from '../utils/api'
import { getSocket } from '../utils/socket'
import {
  ArrowLeft, Shield, Eye, EyeOff, Users, Zap, Ghost,
  UserX, Trash2, AlertTriangle
} from 'lucide-react'

function ToggleSwitch({ active, onToggle, id }) {
  return (
    <div
      id={id}
      className={`toggle-switch ${active ? 'active' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={active}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      <div className="toggle-knob" />
    </div>
  )
}

export default function PrivacySettings() {
  const navigate = useNavigate()
  const toast = useToast()
  const { token, user, updateUser } = useAuth()

  const [settings, setSettings] = useState({
    showProfile: true,
    showOnlineStatus: true,
    allowRandomMatch: true,
    anonymousMode: false,
  })
  const [anonymousId, setAnonymousId] = useState(null)
  const [blockedUsers, setBlockedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([
      apiCall('/privacy', {}, token),
      apiCall('/privacy/blocked', {}, token),
    ])
      .then(([privacyData, blockedData]) => {
        if (!mounted) return
        setSettings(privacyData.privacySettings)
        setAnonymousId(privacyData.anonymousId)
        setBlockedUsers(blockedData.blockedUsers || [])
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [token, toast])

  const handleToggle = async (key) => {
    const newValue = !settings[key]
    const prev = { ...settings }
    setSettings((s) => ({ ...s, [key]: newValue }))
    setSaving(true)
    try {
      const data = await apiCall('/privacy', {
        method: 'PUT',
        body: { [key]: newValue },
      }, token)
      setSettings(data.privacySettings)
      setAnonymousId(data.anonymousId)
      const socket = getSocket(token)
      if (key === 'showOnlineStatus') socket.emit('update_active_visibility', { showActiveStatus: newValue })
      if (key === 'anonymousMode') socket.emit('toggle_anonymous', { enabled: newValue })
      if (user) {
        updateUser({
          ...user,
          privacySettings: data.privacySettings,
          anonymousId: data.anonymousId,
          showActiveStatus: data.privacySettings.showOnlineStatus,
        })
      }
      toast('Setting updated', 'success')
    } catch (err) {
      setSettings(prev)
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUnblock = async (username) => {
    try {
      await apiCall(`/privacy/block/${username}`, { method: 'DELETE' }, token)
      setBlockedUsers((prev) => prev.filter((b) => b.username !== username))
      toast(`${username} unblocked`, 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="spinner spinner-lg mx-auto" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading privacy settings…</p>
        </div>
      </div>
    )
  }

  const toggleItems = [
    { key: 'showProfile', icon: Eye, title: 'Show Profile', description: 'Hide your bio, photo, and interests from others.', color: 'var(--accent3)' },
    { key: 'showOnlineStatus', icon: EyeOff, title: 'Online Status', description: 'Hide your active dot from other users.', color: 'var(--success)' },
    { key: 'allowRandomMatch', icon: Zap, title: 'Random Matching', description: 'Disable to block random chat queue access.', color: 'var(--warning)' },
    { key: 'anonymousMode', icon: Ghost, title: 'Anonymous Mode', description: 'Hide your real identity with a temp name.', color: 'var(--accent2)', isCore: true },
  ]

  return (
    <div className="min-h-screen mesh-bg px-5 py-8 sm:py-10">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 animate-fade-in">
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="chip text-xs">
            <Shield size={11} /> Privacy & Safety
          </div>
        </div>

        {/* Hero */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="text-2xl font-bold font-display mb-1">
            <span className="grad-text">Privacy</span> & Safety
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Control your identity and visibility.
          </p>
        </div>

        {/* Anon banner */}
        {settings.anonymousMode && (
          <div className="anon-banner mb-5 animate-fade-in">
            <Ghost size={15} />
            <div>
              <div className="font-semibold text-sm">Anonymous Mode Active</div>
              <div className="text-xs opacity-75 mt-0.5">You appear as <strong>{anonymousId || 'Anonymous'}</strong></div>
            </div>
          </div>
        )}

        {/* Toggles */}
        <div className="privacy-card mb-5 animate-slide-up">
          <div className="flex items-center gap-2.5 mb-4">
            <Shield size={16} style={{ color: 'var(--accent2)' }} />
            <h2 className="font-bold text-base">Privacy Controls</h2>
          </div>

          {toggleItems.map(({ key, icon: Icon, title, description, color, isCore }) => (
            <div
              key={key}
              className="privacy-toggle-row"
              style={isCore ? {
                background: settings[key] ? 'linear-gradient(135deg, rgba(108,99,255,0.05), rgba(167,139,250,0.03))' : 'transparent',
                borderRadius: 12,
                padding: '14px 10px',
                margin: '2px -10px',
              } : undefined}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${color}12`, border: `1px solid ${color}25` }}
                >
                  <Icon size={14} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-sm mb-0.5">
                    {title}
                    {isCore && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'linear-gradient(135deg, var(--accent), #5b52f0)', color: '#fff' }}>
                        Core
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{description}</p>
                </div>
              </div>
              <ToggleSwitch id={`toggle-${key}`} active={settings[key]} onToggle={() => handleToggle(key)} />
            </div>
          ))}
        </div>

        {/* Blocked */}
        <div className="privacy-card animate-slide-up">
          <div className="flex items-center gap-2.5 mb-4">
            <UserX size={16} style={{ color: 'var(--danger)' }} />
            <h2 className="font-bold text-base">Blocked Users</h2>
            <span className="chip text-[11px] ml-auto">{blockedUsers.length} blocked</span>
          </div>

          {blockedUsers.length === 0 ? (
            <div className="text-center py-6" style={{ color: 'var(--text-dim)' }}>
              <AlertTriangle size={22} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No blocked users</p>
              <p className="text-[11px] mt-1">Block users from chat to prevent contact.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {blockedUsers.map((blocked) => (
                <div
                  key={blocked.username}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}
                >
                  <div>
                    <div className="font-semibold text-sm">{blocked.username}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      Blocked {new Date(blocked.blockedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost text-xs"
                    style={{ height: 30, padding: '0 10px' }}
                    onClick={() => handleUnblock(blocked.username)}
                  >
                    <Trash2 size={11} /> Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Settings take effect immediately. Anonymous mode generates a temporary identity each session.
        </p>
      </div>
    </div>
  )
}
