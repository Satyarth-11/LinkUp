import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSocket } from '../utils/socket'
import { ArrowLeft, Send, Zap, RefreshCw, X, Globe, Hash, SlidersHorizontal } from 'lucide-react'

const LANGUAGES = [
  'Any', 'English', 'Hindi', 'Spanish', 'French', 'German',
  'Portuguese', 'Russian', 'Japanese', 'Korean', 'Chinese',
  'Arabic', 'Italian', 'Turkish', 'Dutch', 'Polish'
]

const INTEREST_SUGGESTIONS = [
  'coding', 'gaming', 'music', 'movies', 'anime', 'sports',
  'travel', 'food', 'books', 'art', 'science', 'tech',
  'photography', 'fitness', 'fashion', 'memes', 'crypto', 'philosophy'
]

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
      {!isMe && <span style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4 }}>Stranger</span>}
      <div className={isMe ? 'bubble-me' : 'bubble-other'} style={{ fontSize: 14, lineHeight: 1.5 }}>
        {msg.text}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0 }}>
        {formatTime(msg.timestamp)}
      </span>
    </div>
  )
}

/* ---- Interest Tag Chip ---- */
function InterestTag({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 500,
        border: selected ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
        background: selected ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.03)',
        color: selected ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {selected ? '✓ ' : '# '}{label}
    </button>
  )
}

const STATUS = { IDLE: 'idle', WAITING: 'waiting', CHATTING: 'chatting', DISCONNECTED: 'disconnected' }

export default function RandomChat() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const [status, setStatus] = useState(STATUS.IDLE)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [currentRoomId, setCurrentRoomId] = useState(null)

  // Matchmaking preferences (persisted across "Next" skips)
  const [language, setLanguage] = useState('Any')
  const [interests, setInterests] = useState([])
  const [customInterest, setCustomInterest] = useState('')
  const [preference, setPreference] = useState('relaxed') // 'strict' | 'relaxed'

  // Track the partner's socket id so "Next" can skip them
  const partnerSocketIdRef = useRef(null)
  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const socket = getSocket(token)
    socketRef.current = socket

    socket.on('random_waiting', ({ message }) => {
      setStatus(STATUS.WAITING)
      setMessages(prev => {
        // Only add if we don't already have this as the last message
        const last = prev[prev.length - 1]
        if (last && last.type === 'system' && last.text === message) return prev
        return [...prev, { type: 'system', text: message, timestamp: new Date(), _id: `sys_${Date.now()}` }]
      })
    })

    socket.on('random_matched', ({ roomId, partnerSocketId }) => {
      setCurrentRoomId(roomId)
      setStatus(STATUS.CHATTING)
      partnerSocketIdRef.current = partnerSocketId || null
    })

    socket.on('receive_message', (msg) => {
      if (msg.sender !== user.username) {
        setMessages(prev => [...prev, { ...msg, _id: msg._id || `msg_${Date.now()}` }])
      }
    })

    socket.on('random_partner_left', () => {
      setStatus(STATUS.DISCONNECTED)
      setCurrentRoomId(null)
    })

    return () => {
      socket.off('random_waiting')
      socket.off('random_matched')
      socket.off('receive_message')
      socket.off('random_partner_left')
    }
  }, [token, user.username])

  /* ---- Start / Re-start matching ---- */
  const startMatching = useCallback((skipSocketId = null) => {
    const socket = socketRef.current
    if (!socket) return
    setMessages([])
    setCurrentRoomId(null)
    partnerSocketIdRef.current = null
    setStatus(STATUS.WAITING)

    socket.emit('join_random', {
      username: user.username,
      interests,
      language,
      preference,
      skipSocketId,
    })
  }, [user.username, interests, language, preference])

  /* ---- Add custom interest ---- */
  const addInterest = (tag) => {
    const t = tag.toLowerCase().trim()
    if (!t || interests.includes(t)) return
    setInterests(prev => [...prev, t])
  }

  const removeInterest = (tag) => {
    setInterests(prev => prev.filter(i => i !== tag))
  }

  const handleCustomInterestKey = (e) => {
    if (e.key === 'Enter' && customInterest.trim()) {
      e.preventDefault()
      addInterest(customInterest)
      setCustomInterest('')
    }
  }

  /* ---- Send message ---- */
  const sendMessage = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !text.trim() || !currentRoomId) return

    const msg = { type: 'text', text: text.trim(), timestamp: new Date(), _id: `me_${Date.now()}`, sender: user.username }
    setMessages(prev => [...prev, msg])
    socket.emit('send_message', {
      roomId: currentRoomId,
      text: text.trim(),
      isAnonymous: true,
      displayName: 'You',
    })
    setText('')
  }, [text, currentRoomId, user.username])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  /* ---- Disconnect ---- */
  const handleDisconnect = () => {
    const socket = socketRef.current
    if (socket) socket.emit('leave_random')
    setStatus(STATUS.DISCONNECTED)
    setCurrentRoomId(null)
    setMessages(prev => [...prev, { type: 'system', text: 'You disconnected from the stranger.', timestamp: new Date(), _id: `dc_${Date.now()}` }])
  }

  /* ---- Next: skip current partner and instantly re-queue ---- */
  const handleNext = () => {
    const socket = socketRef.current
    const prevPartner = partnerSocketIdRef.current
    if (socket) socket.emit('leave_random')
    setCurrentRoomId(null)
    setMessages([{ type: 'system', text: '⏭️ Skipped — finding a new match...', timestamp: new Date(), _id: `skip_${Date.now()}` }])
    setStatus(STATUS.WAITING)
    // Instantly re-queue with skip
    setTimeout(() => startMatching(prevPartner), 100)
  }

  /* ---- Cancel waiting ---- */
  const handleCancelWait = () => {
    const socket = socketRef.current
    if (socket) socket.emit('leave_random')
    setStatus(STATUS.IDLE)
    setMessages([])
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="glass-strong shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-icon" onClick={() => { handleDisconnect(); navigate('/') }}>
              <ArrowLeft size={16} />
            </button>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} style={{ color: 'var(--accent2)' }} /> Random Chat
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {status === STATUS.IDLE && 'Configure & connect'}
                {status === STATUS.WAITING && '🔍 Matching you with someone...'}
                {status === STATUS.CHATTING && '🟢 Connected with stranger'}
                {status === STATUS.DISCONNECTED && '🔴 Disconnected'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {status === STATUS.WAITING && (
              <button className="btn btn-ghost" style={{ fontSize: 12, height: 34, padding: '0 12px' }} onClick={handleCancelWait}>
                <X size={13} /> Cancel
              </button>
            )}
            {status === STATUS.CHATTING && (
              <>
                <button className="btn btn-ghost" style={{ fontSize: 12, height: 34, padding: '0 12px' }} onClick={handleNext}>
                  <RefreshCw size={13} /> Next
                </button>
                <button className="btn btn-danger" style={{ fontSize: 12, height: 34, padding: '0 12px' }} onClick={handleDisconnect}>
                  <X size={13} /> Stop
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 12, paddingBottom: 4 }}>

        {/* ============ IDLE — Matchmaking Config ============ */}
        {status === STATUS.IDLE && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: 460, width: '100%', padding: '0 20px' }}>
              <div style={{ fontSize: 52, marginBottom: 8 }}>🎲</div>
              <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>Meet a Stranger</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                Set your preferences below for smarter matching. The more you share, the better the match.
              </p>

              {/* Language */}
              <div style={{ textAlign: 'left', marginBottom: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
                  <Globe size={14} /> Language
                </label>
                <select
                  className="inp"
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  style={{ width: '100%', height: 40, fontSize: 13, cursor: 'pointer' }}
                >
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Interests */}
              <div style={{ textAlign: 'left', marginBottom: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
                  <Hash size={14} /> Interests
                  <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 11, marginLeft: 4 }}>
                    ({interests.length} selected)
                  </span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {INTEREST_SUGGESTIONS.map(tag => (
                    <InterestTag
                      key={tag}
                      label={tag}
                      selected={interests.includes(tag)}
                      onClick={() => interests.includes(tag) ? removeInterest(tag) : addInterest(tag)}
                    />
                  ))}
                </div>
                <input
                  className="inp"
                  style={{ width: '100%', height: 36, fontSize: 12 }}
                  placeholder="Type custom interest and press Enter..."
                  value={customInterest}
                  onChange={e => setCustomInterest(e.target.value)}
                  onKeyDown={handleCustomInterestKey}
                />
                {interests.filter(i => !INTEREST_SUGGESTIONS.includes(i)).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {interests.filter(i => !INTEREST_SUGGESTIONS.includes(i)).map(tag => (
                      <InterestTag key={tag} label={tag} selected onClick={() => removeInterest(tag)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Preference toggle */}
              <div style={{ textAlign: 'left', marginBottom: 24 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
                  <SlidersHorizontal size={14} /> Match Strictness
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setPreference('relaxed')}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: preference === 'relaxed' ? '2px solid var(--accent)' : '2px solid var(--border)',
                      background: preference === 'relaxed' ? 'rgba(108,99,255,0.1)' : 'transparent',
                      color: preference === 'relaxed' ? 'var(--accent)' : 'var(--text-muted)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    🌐 Relaxed
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>Match anyone if no exact fit</div>
                  </button>
                  <button
                    onClick={() => setPreference('strict')}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: preference === 'strict' ? '2px solid #f59e0b' : '2px solid var(--border)',
                      background: preference === 'strict' ? 'rgba(245,158,11,0.1)' : 'transparent',
                      color: preference === 'strict' ? '#f59e0b' : 'var(--text-muted)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    🎯 Strict
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>Only matching interests/lang</div>
                  </button>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ height: 50, fontSize: 16, padding: '0 32px', background: 'linear-gradient(135deg, #6c63ff, #38bdf8)', width: '100%' }}
                onClick={() => startMatching(null)}
              >
                <Zap size={18} /> Start Chatting
              </button>
            </div>
          </div>
        )}

        {/* ============ WAITING ============ */}
        {status === STATUS.WAITING && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid rgba(108,99,255,0.3)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Finding your best match...</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>Usually takes just a few seconds</p>
              {(interests.length > 0 || language !== 'Any') && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                  {language !== 'Any' && (
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(108,99,255,0.12)', color: 'var(--accent)' }}>
                      🌐 {language}
                    </span>
                  )}
                  {interests.slice(0, 6).map(i => (
                    <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>
                      #{i}
                    </span>
                  ))}
                  {interests.length > 6 && (
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', color: 'var(--text-dim)' }}>
                      +{interests.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ CHATTING / DISCONNECTED ============ */}
        {(status === STATUS.CHATTING || status === STATUS.DISCONNECTED) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {messages.map((msg, i) => (
              <Message key={msg._id || i} msg={msg} isMe={msg.sender === user.username} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {(status === STATUS.CHATTING) && (
        <div className="glass-strong border-t shrink-0" style={{ borderColor: 'var(--border)', padding: '10px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 900, margin: '0 auto' }}>
            <input
              className="inp"
              style={{ flex: 1, height: 42 }}
              placeholder="Say something to the stranger..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="btn btn-primary btn-icon"
              style={{ height: 42, width: 42, opacity: !text.trim() ? 0.5 : 1 }}
              onClick={sendMessage}
              disabled={!text.trim()}
            >
              <Send size={15} />
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>
            🎭 You are completely anonymous
          </p>
        </div>
      )}

      {status === STATUS.DISCONNECTED && (
        <div className="glass-strong border-t shrink-0" style={{ borderColor: 'var(--border)', padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => { setStatus(STATUS.IDLE); setMessages([]); }}>
              <Zap size={15} /> Find New Stranger
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              <ArrowLeft size={15} /> Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
