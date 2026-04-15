import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getSocket, disconnectSocket } from '../utils/socket'
import { apiCall } from '../utils/api'
import {
  ArrowLeft, Send, Image, X, Users, Lock, Eye, EyeOff, Smile
} from 'lucide-react'

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TypingIndicator({ names }) {
  if (!names.length) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 12px', borderRadius: 18, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{names.join(', ')} typing…</span>
    </div>
  )
}

function Message({ msg, isMe }) {
  if (msg.type === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 16px' }}>
        <div className="bubble-system">{msg.text}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', padding: '2px 16px', gap: 2 }}>
      {!isMe && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4 }}>
          {msg.displayName || msg.sender}
          {msg.isAnonymous && ' 🎭'}
        </span>
      )}
      <div className={isMe ? 'bubble-me' : 'bubble-other'} style={{ fontSize: 14, lineHeight: 1.5 }}>
        {msg.image && (
          <img src={msg.image} alt="shared" style={{ maxWidth: 220, borderRadius: 8, marginBottom: msg.text ? 6 : 0, display: 'block' }} />
        )}
        {msg.text && <span>{msg.text}</span>}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0 }}>
        {formatTime(msg.timestamp)}
      </span>
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
  const [typingUsers, setTypingUsers] = useState({})
  const [roomInfo, setRoomInfo] = useState(null)
  const [onlineCount, setOnlineCount] = useState(1)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const fileRef = useRef(null)
  const typingTimer = useRef(null)
  const isTypingRef = useRef(false)

  // Scroll to bottom
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(scrollToBottom, [messages])

  // Fetch room info
  useEffect(() => {
    apiCall(`/room/${roomId}`, {}, token)
      .then(data => setRoomInfo(data))
      .catch(() => {})
  }, [roomId, token])

  // Setup socket
  useEffect(() => {
    const socket = getSocket(token)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join_room', {
        roomId,
        displayName: user.username,
        isAnonymous: false,
      })
    })

    socket.on('chat_history', (history) => {
      setMessages(history)
    })

    socket.on('receive_message', (msg) => {
      setMessages(prev => {
        // Avoid duplicates by _id
        if (msg._id && prev.find(m => m._id === msg._id)) return prev
        return [...prev, msg]
      })
    })

    socket.on('user_joined', ({ message }) => {
      setMessages(prev => [...prev, { type: 'system', text: message, timestamp: new Date(), _id: Date.now() }])
      setOnlineCount(c => c + 1)
    })

    socket.on('user_left', ({ message }) => {
      setMessages(prev => [...prev, { type: 'system', text: message, timestamp: new Date(), _id: Date.now() }])
      setOnlineCount(c => Math.max(1, c - 1))
    })

    socket.on('user_typing', ({ username, isTyping }) => {
      setTypingUsers(prev => {
        const updated = { ...prev }
        if (isTyping) updated[username] = true
        else delete updated[username]
        return updated
      })
    })

    socket.on('error', ({ message }) => toast(message, 'error'))

    // If socket already connected, join now
    if (socket.connected) {
      setConnected(true)
      socket.emit('join_room', { roomId, displayName: user.username, isAnonymous: false })
    }

    return () => {
      socket.emit('leave_room', { roomId, displayName: user.username })
      socket.off('connect')
      socket.off('chat_history')
      socket.off('receive_message')
      socket.off('user_joined')
      socket.off('user_left')
      socket.off('user_typing')
      socket.off('error')
    }
  }, [roomId, token, user.username])

  // Typing emit
  const handleTyping = (e) => {
    setText(e.target.value)
    const socket = socketRef.current
    if (!socket) return

    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('typing', { roomId, isTyping: true, displayName: isAnonymous ? 'Anonymous' : user.username })
    }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('typing', { roomId, isTyping: false, displayName: isAnonymous ? 'Anonymous' : user.username })
    }, 1500)
  }

  // Send message
  const sendMessage = useCallback(async () => {
    const socket = socketRef.current
    if (!socket || (!text.trim() && !imagePreview)) return

    let imageUrl = null
    if (imagePreview) {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('image', imagePreview.file)
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        const data = await res.json()
        imageUrl = data.imageUrl
      } catch {
        toast('Image upload failed', 'error')
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
      displayName: isAnonymous ? 'Anonymous' : user.username,
    })

    setText('')
    // Stop typing
    isTypingRef.current = false
    socket.emit('typing', { roomId, isTyping: false, displayName: user.username })
  }, [text, imagePreview, isAnonymous, roomId, token, user.username])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'error'); return }
    const url = URL.createObjectURL(file)
    setImagePreview({ url, file })
    e.target.value = ''
  }

  const typingNames = Object.keys(typingUsers).filter(n => n !== user.username)

  const roomTypeIcon = roomInfo?.type === 'private' ? <Lock size={14} /> : <Users size={14} />

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="glass-strong shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-icon" onClick={() => navigate('/')}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 15 }}>
                {roomTypeIcon}
                {roomInfo?.name || roomId}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {roomInfo?.type || 'group'} · {onlineCount} online
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="chip" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              {roomId}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 10px', borderRadius: 8, background: isAnonymous ? 'rgba(108,99,255,0.12)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', transition: 'all 0.2s' }}
              onClick={() => setIsAnonymous(v => !v)}
              title={isAnonymous ? 'Currently anonymous' : 'Click to go anonymous'}
            >
              {isAnonymous ? <EyeOff size={13} style={{ color: 'var(--accent2)' }} /> : <Eye size={13} />}
              <span style={{ fontSize: 11, fontWeight: 500, color: isAnonymous ? 'var(--accent2)' : 'var(--text-muted)' }}>
                {isAnonymous ? 'Anon' : 'Visible'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 12, paddingBottom: 4 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 80, color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>No messages yet</p>
            <p style={{ fontSize: 13 }}>Be the first to say something!</p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.map((msg, i) => (
            <Message
              key={msg._id || i}
              msg={msg}
              isMe={!msg.isAnonymous && msg.sender === user.username}
            />
          ))}
        </div>
        <TypingIndicator names={typingNames} />
        <div ref={messagesEndRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={imagePreview.url} alt="preview" style={{ maxHeight: 80, borderRadius: 8, border: '1px solid var(--border)' }} />
            <button onClick={() => setImagePreview(null)} style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', background: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="glass-strong border-t shrink-0" style={{ borderColor: 'var(--border)', padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: 900, margin: '0 auto' }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button className="btn btn-ghost btn-icon" onClick={() => fileRef.current?.click()} title="Share image">
            <Image size={16} />
          </button>
          <textarea
            className="inp"
            style={{ flex: 1, resize: 'none', height: 42, lineHeight: 1.5, paddingTop: 10, paddingBottom: 10 }}
            placeholder={isAnonymous ? 'Send as Anonymous...' : `Message as ${user.username}...`}
            value={text}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className="btn btn-primary btn-icon"
            style={{ height: 42, width: 42, opacity: (!text.trim() && !imagePreview) ? 0.5 : 1 }}
            onClick={sendMessage}
            disabled={uploading || (!text.trim() && !imagePreview)}
          >
            {uploading ? (
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
        {isAnonymous && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--accent2)', marginTop: 5 }}>
            🎭 Sending as Anonymous — your identity is hidden
          </p>
        )}
      </div>
    </div>
  )
}
