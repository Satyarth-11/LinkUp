import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Save, Sparkles, UserCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiCall, API_BASE } from '../utils/api'
import { getSocket } from '../utils/socket'

const MAX_INTERESTS = 12

const parseInterests = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_INTERESTS)

export default function ProfilePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { token, user, updateUser } = useAuth()

  const [form, setForm] = useState({
    username: '',
    bio: '',
    profilePicture: '',
    interestsInput: '',
    showActiveStatus: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let mounted = true
    apiCall('/auth/profile', {}, token)
      .then((data) => {
        if (!mounted) return
        const profile = data.user
        setForm({
          username: profile.username || '',
          bio: profile.bio || '',
          profilePicture: profile.profilePicture || '',
          interestsInput: (profile.interests || []).join(', '),
          showActiveStatus: profile.showActiveStatus !== false,
        })
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [token, toast])

  const parsedInterests = useMemo(() => parseInterests(form.interestsInput), [form.interestsInput])
  const previewImage = form.profilePicture.trim()
  const previewInitial = (form.username || user?.username || 'U').charAt(0).toUpperCase()

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = await apiCall('/auth/profile', {
        method: 'PUT',
        body: {
          bio: form.bio,
          profilePicture: form.profilePicture,
          interests: parsedInterests,
          showActiveStatus: form.showActiveStatus,
        },
      }, token)
      updateUser(data.user)
      const socket = getSocket(token)
      socket.emit('update_active_visibility', { showActiveStatus: data.user.showActiveStatus !== false })
      setForm((prev) => ({
        ...prev,
        username: data.user.username || prev.username,
        interestsInput: (data.user.interests || []).join(', '),
        showActiveStatus: data.user.showActiveStatus !== false,
      }))
      toast('Profile updated', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleProfileImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast('Profile image must be under 5MB', 'error')
      e.target.value = ''
      return
    }
    const formData = new FormData()
    formData.append('image', file)
    setUploadingImage(true)
    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Upload failed')
      setForm((prev) => ({ ...prev, profilePicture: data.imageUrl }))
      toast('Profile image uploaded', 'success')
    } catch (err) {
      toast(err.message || 'Upload failed', 'error')
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="spinner spinner-lg mx-auto" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading profile…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen mesh-bg px-5 py-8 sm:py-10">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 animate-fade-in">
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="chip text-xs">
            <Sparkles size={11} /> Profile
          </div>
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)' }}>
          {/* ---- Preview Card ---- */}
          <aside className="glass-strong rounded-2xl p-6 animate-fade-in hidden sm:block">
            <div className="flex flex-col items-center gap-3">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileImageChange} />
              <div
                className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-3xl font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent), #38bdf8)', border: '2px solid rgba(255,255,255,0.12)' }}
              >
                {previewImage ? (
                  <img src={previewImage} alt="Profile" className="w-full h-full object-cover" />
                ) : previewInitial}
              </div>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                style={{ minWidth: 160 }}
              >
                {uploadingImage ? (
                  <><span className="spinner spinner-sm" /> Uploading…</>
                ) : (
                  <><ImagePlus size={14} /> Upload Photo</>
                )}
              </button>
              <div className="text-center">
                <h2 className="text-lg font-bold">{form.username}</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {form.bio || 'No bio yet.'}
                </p>
              </div>
              {parsedInterests.length > 0 && (
                <div className="w-full">
                  <p className="text-[11px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-dim)' }}>Interests</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedInterests.map((interest) => (
                      <span
                        key={interest}
                        className="px-2.5 py-1 rounded-full text-[11px]"
                        style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.18)' }}
                      >
                        #{interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ---- Edit Form ---- */}
          <section className="glass-strong rounded-2xl p-6 sm:p-7 animate-slide-up">
            <div className="flex items-center gap-2.5 mb-1">
              <UserCircle2 size={18} style={{ color: 'var(--accent2)' }} />
              <h2 className="text-xl font-bold">Edit Profile</h2>
            </div>
            <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
              Update your public profile details.
            </p>

            {/* Mobile avatar upload */}
            <div className="sm:hidden flex items-center gap-3 mb-5">
              <div
                className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-xl font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent), #38bdf8)' }}
              >
                {previewImage ? <img src={previewImage} alt="" className="w-full h-full object-cover" /> : previewInitial}
              </div>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? <><span className="spinner spinner-sm" /> Uploading…</> : <><ImagePlus size={13} /> Upload</>}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileImageChange} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Username</label>
                <input className="inp" value={form.username} disabled />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-dim)' }}>Username cannot be changed.</p>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Bio</label>
                <textarea
                  className="inp"
                  value={form.bio}
                  onChange={handleChange('bio')}
                  rows={3}
                  maxLength={160}
                  placeholder="Tell people about yourself…"
                  style={{ resize: 'vertical', minHeight: 88 }}
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-dim)' }}>{form.bio.length}/160</p>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Privacy & Visibility</label>
                <button
                  type="button"
                  onClick={() => navigate('/privacy')}
                  className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'linear-gradient(135deg, rgba(108,99,255,0.05), rgba(167,139,250,0.03))',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="flex items-center gap-2 text-sm">🛡️ Manage Privacy Settings</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent2)' }}>→</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Interests</label>
                <input
                  className="inp"
                  value={form.interestsInput}
                  onChange={handleChange('interestsInput')}
                  placeholder="coding, music, movies, design"
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-dim)' }}>Comma-separated, up to {MAX_INTERESTS}.</p>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ height: 42, minWidth: 150 }}
                disabled={saving}
              >
                {saving ? (
                  <span className="flex items-center gap-2"><span className="spinner spinner-sm" /> Saving…</span>
                ) : (
                  <><Save size={14} /> Save Profile</>
                )}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
