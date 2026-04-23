import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getSocket } from '../utils/socket'
import { apiCall } from '../utils/api'
import VideoCall, { CALL_STATE } from '../components/VideoCall'
import {
  ArrowLeft, Send, Image, X, Users, Lock, Eye, EyeOff,
  Ghost, ShieldAlert, Flag, UserX, Video
} from 'lucide-react'

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getMessageReceipt(msg, currentUsername) {
  if (msg.type === 'system' || msg.sender !== currentUsername || msg.isAnonymous) return null
  const seenBy = Array.isArray(msg.seenBy) ? msg.seenBy : []
  const seenByOthers = seenBy.some((username) => username && username !== currentUsername)
  return seenByOthers ? 'Seen' : 'Sent'
}

function TypingIndicator({ names }) {
  if (!names.length) return null
  const label = names.length === 1
    ? `${names[0]} is typing…`
    : `${names.join(', ')} are typing…`

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1 items-center px-3 py-2 rounded-2xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function ReportModal({ targetUsername, onClose, token, toast }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reason) { toast('Select a reason', 'error'); return }
    setSubmitting(true)
    try {
      await apiCall('/privacy/report', {
        method: 'POST',
        body: { username: targetUsername, reason, details },
      }, token)
      toast('Report submitted', 'success')
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const reasons = [
    { value: 'spam', label: '🗑️ Spam' },
    { value: 'harassment', label: '😤 Harassment' },
    { value: 'inappropriate', label: '🚫 Inappropriate Content' },
    { value: 'other', label: '📋 Other' },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flag size={17} style={{ color: 'var(--warning)' }} />
            <h3 className="font-bold text-base">Report User</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Reporting <strong>{targetUsername}</strong>. Select a reason:
        </p>
        <div className="flex flex-col gap-2 mb-4">
          {reasons.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className="p-2.5 rounded-xl text-sm font-medium text-left transition-all"
              style={{
                border: reason === r.value ? '2px solid var(--warning)' : '1px solid var(--border)',
                background: reason === r.value ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                color: reason === r.value ? 'var(--warning)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          className="inp mb-4"
          placeholder="Additional details (optional)…"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={500}
          style={{ resize: 'vertical' }}
        />
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-warn" onClick={handleSubmit} disabled={submitting || !reason}>
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg, isMe, currentUsername }) {
  if (msg.type === 'system') {
    return (
      <div className="flex justify-center px-4 py-0.5">
        <div className="bubble-system">{msg.text}</div>
      </div>
    )
  }

  const receipt = getMessageReceipt(msg, currentUsername)

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} px-4 py-0.5`}>
      {!isMe && (
        <span className="text-[11px] mb-0.5 pl-1" style={{ color: 'var(--text-muted)' }}>
          {msg.isAnonymous ? (msg.anonymousId || msg.displayName || 'Anonymous') : (msg.displayName || msg.sender)}
          {msg.isAnonymous && <Ghost size={9} className="inline ml-1 opacity-50" />}
        </span>
      )}
      <div className={isMe ? 'bubble-me' : 'bubble-other'}>
        {msg.image && (
          <img src={msg.image} alt="shared" className="rounded-lg mb-1.5 block" style={{ maxWidth: 220 }} />
        )}
        {msg.text && <span>{msg.text}</span>}
        <div className={`flex items-center gap-1.5 mt-1 ${isMe ? 'justify-end' : ''}`}>
          <span className="text-[10px] opacity-50">{formatTime(msg.timestamp)}</span>
          {receipt && <span className="text-[10px] opacity-40 font-medium">{receipt}</span>}
        </div>
      </div>
    </div>
  )
}

export default function ChatRoom() {
  const { roomId } = useParams()
  const { user, token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [anonymousId, setAnonymousId] = useState(null)
  const [typingUsers, setTypingUsers] = useState({})
  const [roomInfo, setRoomInfo] = useState(null)
  const [onlineCount, setOnlineCount] = useState(1)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportTarget, setReportTarget] = useState('')
  const [socketMap, setSocketMap] = useState({})
  const [callState, setCallState] = useState(CALL_STATE.IDLE)

  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const fileRef = useRef(null)
  const typingTimer = useRef(null)
  const remoteTypingTimers = useRef({})
  const isTypingRef = useRef(false)

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(scrollToBottom, [messages])

  // Load privacy settings for anonymous mode sync
  useEffect(() => {
    if (user?.privacySettings?.anonymousMode) {
      setIsAnonymous(true)
      setAnonymousId(user.anonymousId || null)
    }
  }, [user])

  useEffect(() => {
    apiCall(`/room/${roomId}`, {}, token)
      .then(data => setRoomInfo(data))
      .catch(() => {})
  }, [roomId, token])

  const markMessagesAsSeen = useCallback((items) => {
    const socket = socketRef.current
    if (!socket || !Array.isArray(items) || !items.length) return
    const me = isAnonymous ? (anonymousId || 'Anonymous') : user.username

    const messageIds = items
      .filter((msg) => msg && msg._id && msg.sender !== me && !msg.isAnonymous)
      .filter((msg) => !(Array.isArray(msg.seenBy) && msg.seenBy.includes(me)))
      .map((msg) => msg._id)

    if (!messageIds.length) return
    socket.emit('mark_seen', { roomId, messageIds })
  }, [roomId, user.username, isAnonymous, anonymousId])

  const emitStopTyping = useCallback(() => {
    const socket = socketRef.current
    if (typingTimer.current) {
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    }
    if (!socket || !isTypingRef.current) return
    isTypingRef.current = false
    socket.emit('stopTyping', {
      roomId,
      displayName: isAnonymous ? (anonymousId || 'Anonymous') : user.username,
    })
  }, [roomId, isAnonymous, anonymousId, user.username])

  useEffect(() => {
    const socket = getSocket(token)
    socketRef.current = socket

    const handleConnect = () => {
      setConnected(true)
      socket.emit('join_room', {
        roomId,
        displayName: isAnonymous ? (anonymousId || 'Anonymous') : user.username,
        isAnonymous,
      })
    }

    const handleHistory = (history) => {
      setMessages(history)
      markMessagesAsSeen(history)
    }

    const handleMessage = (msg) => {
      setMessages(prev => {
        if (msg._id && prev.find(m => m._id === msg._id)) return prev
        return [...prev, msg]
      })
      markMessagesAsSeen([msg])
    }

    const handleUserJoined = ({ message }) => {
      setMessages(prev => [...prev, { type: 'system', text: message, timestamp: new Date(), _id: Date.now() }])
    }

    const handleUserLeft = ({ message }) => {
      setMessages(prev => [...prev, { type: 'system', text: message, timestamp: new Date(), _id: Date.now() }])
    }

    const handleRoomOnline = ({ count = 0, users = [], socketMap: sMap = {} }) => {
      setOnlineCount(count)
      setOnlineUsers(users)
      setSocketMap(sMap)
    }

    const handleTyping = ({ username }) => {
      setTypingUsers(prev => ({ ...prev, [username]: true }))
      if (remoteTypingTimers.current[username]) clearTimeout(remoteTypingTimers.current[username])
      remoteTypingTimers.current[username] = setTimeout(() => {
        setTypingUsers(prev => { const u = { ...prev }; delete u[username]; return u })
        delete remoteTypingTimers.current[username]
      }, 2000)
    }

    const handleStopTyping = ({ username }) => {
      if (remoteTypingTimers.current[username]) {
        clearTimeout(remoteTypingTimers.current[username])
        delete remoteTypingTimers.current[username]
      }
      setTypingUsers(prev => { const u = { ...prev }; delete u[username]; return u })
    }

    const handleSeen = ({ messageIds = [], seenBy }) => {
      setMessages((prev) => prev.map((msg) => {
        if (!messageIds.includes(msg._id)) return msg
        const existing = Array.isArray(msg.seenBy) ? msg.seenBy : []
        if (existing.includes(seenBy)) return msg
        return { ...msg, seenBy: [...existing, seenBy] }
      }))
    }

    const handleAnonUpdate = ({ enabled, anonymousId: anonId }) => {
      setIsAnonymous(enabled)
      setAnonymousId(anonId)
    }

    const handleBlocked = ({ username }) => toast(`${username} blocked`, 'success')
    const handleError = ({ message }) => toast(message, 'error')

    socket.on('connect', handleConnect)
    socket.on('chat_history', handleHistory)
    socket.on('receive_message', handleMessage)
    socket.on('user_joined', handleUserJoined)
    socket.on('user_left', handleUserLeft)
    socket.on('room_online_users', handleRoomOnline)
    socket.on('user_typing', handleTyping)
    socket.on('user_stop_typing', handleStopTyping)
    socket.on('messages_seen', handleSeen)
    socket.on('anonymous_mode_updated', handleAnonUpdate)
    socket.on('user_blocked', handleBlocked)
    socket.on('error', handleError)

    if (socket.connected) {
      setConnected(true)
      socket.emit('join_room', {
        roomId,
        displayName: isAnonymous ? (anonymousId || 'Anonymous') : user.username,
        isAnonymous,
      })
    }

    return () => {
      emitStopTyping()
      socket.emit('leave_room', { roomId, displayName: isAnonymous ? (anonymousId || 'Anonymous') : user.username })
      Object.values(remoteTypingTimers.current).forEach(clearTimeout)
      remoteTypingTimers.current = {}
      socket.off('connect', handleConnect)
      socket.off('chat_history', handleHistory)
      socket.off('receive_message', handleMessage)
      socket.off('user_joined', handleUserJoined)
      socket.off('user_left', handleUserLeft)
      socket.off('room_online_users', handleRoomOnline)
      socket.off('user_typing', handleTyping)
      socket.off('user_stop_typing', handleStopTyping)
      socket.off('messages_seen', handleSeen)
      socket.off('anonymous_mode_updated', handleAnonUpdate)
      socket.off('user_blocked', handleBlocked)
      socket.off('error', handleError)
    }
  }, [roomId, token, user.username, toast, emitStopTyping, markMessagesAsSeen, isAnonymous, anonymousId])

  const handleToggleAnonymous = () => {
    const socket = socketRef.current
    if (socket) socket.emit('toggle_anonymous', { enabled: !isAnonymous })
  }

  const handleBlockUser = (username) => {
    if (!username) return
    socketRef.current?.emit('block_user_live', { username })
  }

  const handleReportUser = (username) => {
    setReportTarget(username)
    setShowReportModal(true)
  }

  const handleTyping = (e) => {
    const value = e.target.value
    setText(value)
    const socket = socketRef.current
    if (!socket) return
    if (!value.trim()) { emitStopTyping(); return }
    const displayName = isAnonymous ? (anonymousId || 'Anonymous') : user.username
    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('typing', { roomId, displayName })
    }
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(emitStopTyping, 2000)
  }

  const sendMessage = useCallback(async () => {
    const socket = socketRef.current
    if (!socket || (!text.trim() && !imagePreview)) return

    let imageUrl = null
    if (imagePreview) {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('image', imagePreview.file)
        const apiUrl = import.meta.env.VITE_API_URL || ''
        const res = await fetch(`${apiUrl}/api/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Upload failed')
        imageUrl = data.imageUrl
      } catch (err) {
        toast(err.message || 'Image upload failed', 'error')
        setUploading(false)
        return
      }
      setUploading(false)
      setImagePreview(null)
    }

    socket.emit('send_message', {
      roomId,
      text: text.trim(),
      image: imageUrl,
      isAnonymous,
      displayName: isAnonymous ? (anonymousId || 'Anonymous') : user.username,
    })
    setText('')
    emitStopTyping()
  }, [text, imagePreview, isAnonymous, anonymousId, roomId, token, user.username, toast, emitStopTyping])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'error'); return }
    setImagePreview({ url: URL.createObjectURL(file), file })
    e.target.value = ''
  }

  const myDisplayName = isAnonymous ? (anonymousId || 'Anonymous') : user.username
  const typingNames = Object.keys(typingUsers).filter(name => name !== myDisplayName)
  const roomTypeIcon = roomInfo?.type === 'private' ? <Lock size={13} /> : <Users size={13} />
  const roomMembers = [...new Set((roomInfo?.members || []).map(m => m?.toLowerCase()).filter(Boolean))]
  const otherMembers = roomMembers.filter(m => m !== user.username?.toLowerCase())

  // Video call
  const callTargetUsername = roomInfo?.type === 'private' && otherMembers.length > 0
    ? otherMembers.find(m => onlineUsers.includes(m)) || null
    : null
  const callTargetSocketId = callTargetUsername ? (socketMap[callTargetUsername] || null) : null

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* ---- Header ---- */}
      <header className="glass-strong shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3 min-w-0">
            <button className="btn btn-ghost btn-icon shrink-0" onClick={() => navigate('/')}>
              <ArrowLeft size={15} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-bold text-sm truncate">
                {roomTypeIcon}
                <span className="truncate">{roomInfo?.name || roomId}</span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {onlineCount} online{!connected && ' · reconnecting…'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Anon toggle */}
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              onClick={handleToggleAnonymous}
              title={isAnonymous ? 'Anonymous mode active' : 'Click to go anonymous'}
              style={{
                background: isAnonymous ? 'rgba(108,99,255,0.1)' : 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                color: isAnonymous ? 'var(--accent2)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {isAnonymous ? <Ghost size={12} /> : <Eye size={12} />}
              {isAnonymous ? (anonymousId || 'Anon') : 'Visible'}
            </button>

            {/* Safety */}
            {otherMembers.length > 0 && (
              <div className="flex items-center gap-1">
                <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }} title={`Block ${otherMembers[0]}`} onClick={() => handleBlockUser(otherMembers[0])}>
                  <UserX size={12} style={{ color: 'var(--danger)' }} />
                </button>
                <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }} title={`Report ${otherMembers[0]}`} onClick={() => handleReportUser(otherMembers[0])}>
                  <Flag size={12} style={{ color: 'var(--warning)' }} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Anon banner */}
        {isAnonymous && (
          <div className="anon-banner mx-3 mb-2" style={{ borderRadius: 10 }}>
            <Ghost size={13} />
            <span className="text-xs">Anonymous — You are <strong>{anonymousId || 'Anonymous'}</strong></span>
          </div>
        )}
      </header>

      {/* ---- Messages ---- */}
      <div className="flex-1 overflow-y-auto pt-3 pb-1">
        {roomMembers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {roomMembers.map((member) => {
              const isOnline = onlineUsers.includes(member)
              return (
                <div key={member} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  <span className="block w-1.5 h-1.5 rounded-full"
                    style={{ background: isOnline ? 'var(--success)' : 'var(--text-dim)', boxShadow: isOnline ? '0 0 6px rgba(34,197,94,0.4)' : 'none' }}
                  />
                  {member}
                </div>
              )
            })}
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center mt-20" style={{ color: 'var(--text-dim)' }}>
            <div className="text-4xl mb-3 opacity-30">💬</div>
            <p className="font-semibold mb-1">No messages yet</p>
            <p className="text-xs">Be the first to say something!</p>
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg._id || i}
              msg={msg}
              isMe={msg.isAnonymous
                ? (msg.sender === anonymousId || msg.anonymousId === anonymousId)
                : msg.sender === user.username
              }
              currentUsername={isAnonymous ? (anonymousId || 'Anonymous') : user.username}
            />
          ))}
        </div>
        <TypingIndicator names={typingNames} />
        <div ref={messagesEndRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="relative inline-block">
            <img src={imagePreview.url} alt="preview" className="rounded-lg" style={{ maxHeight: 72, border: '1px solid var(--border)' }} />
            <button
              onClick={() => setImagePreview(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--danger)', border: 'none', cursor: 'pointer', color: '#fff' }}
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {/* ---- Input bar ---- */}
      <div className="glass-strong border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-end gap-2 px-4 py-2.5 max-w-3xl mx-auto">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <button className="btn btn-ghost btn-icon shrink-0" style={{ width: 38, height: 38 }} onClick={() => fileRef.current?.click()} title="Share image">
            <Image size={15} />
          </button>
          <textarea
            className="inp flex-1"
            style={{ resize: 'none', height: 40, lineHeight: 1.5, paddingTop: 9, paddingBottom: 9 }}
            placeholder={isAnonymous ? `Send as ${anonymousId || 'Anonymous'}…` : `Message…`}
            value={text}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className="btn btn-primary btn-icon shrink-0"
            style={{ width: 40, height: 40 }}
            onClick={sendMessage}
            disabled={uploading || (!text.trim() && !imagePreview)}
          >
            {uploading ? <span className="spinner spinner-sm" /> : <Send size={15} />}
          </button>
        </div>
        {isAnonymous && (
          <p className="text-center text-[11px] pb-1.5" style={{ color: 'var(--accent2)' }}>
            🎭 Sending as {anonymousId || 'Anonymous'}
          </p>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          targetUsername={reportTarget}
          onClose={() => setShowReportModal(false)}
          token={token}
          toast={toast}
        />
      )}

      {/* Video Call */}
      {connected && socketRef.current && (
        <VideoCall
          socket={socketRef.current}
          currentSocketId={socketRef.current?.id}
          currentUsername={user.username}
          targetSocketId={callTargetSocketId}
          targetName={callTargetUsername || otherMembers[0] || 'User'}
          roomId={roomId}
          onCallStateChange={setCallState}
        />
      )}
    </div>
  )
}
