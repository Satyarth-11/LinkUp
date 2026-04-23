import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getSocket } from '../utils/socket'
import { apiCall } from '../utils/api'
import { getOrCreateKeyPair, deriveSharedKey, encryptMessage, decryptMessage } from '../utils/crypto'
import {
  ArrowLeft, Send, Zap, RefreshCw, X, Globe, Hash, SlidersHorizontal,
  Ghost, UserX, Flag, ShieldOff
} from 'lucide-react'

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

function MessageBubble({ msg, isMe }) {
  if (msg.type === 'system') {
    return (
      <div className="flex justify-center px-4 py-0.5">
        <div className="bubble-system">{msg.text}</div>
      </div>
    )
  }
  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} px-4 py-0.5`}>
      {!isMe && <span className="text-[11px] mb-0.5 pl-1" style={{ color: 'var(--text-muted)' }}>Stranger</span>}
      <div className={isMe ? 'bubble-me' : 'bubble-other'}>
        {msg.text}
        <div className={`flex mt-1 ${isMe ? 'justify-end' : ''}`}>
          <span className="text-[10px] opacity-50">{formatTime(msg.timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

function InterestTag({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-medium transition-all"
      style={{
        border: selected ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
        background: selected ? 'rgba(108,99,255,0.12)' : 'rgba(255,255,255,0.02)',
        color: selected ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {selected ? '✓ ' : '# '}{label}
    </button>
  )
}

function ReportModal({ onClose, token, toast }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reason) { toast('Select a reason', 'error'); return }
    setSubmitting(true)
    try {
      await apiCall('/privacy/report', {
        method: 'POST',
        body: { username: 'anonymous_stranger', reason, details: `[Random Chat Report] ${details}` },
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
            <h3 className="font-bold text-base">Report Stranger</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Report this stranger for inappropriate behavior.
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

const STATUS = { IDLE: 'idle', WAITING: 'waiting', CHATTING: 'chatting', DISCONNECTED: 'disconnected', BLOCKED: 'blocked' }

export default function RandomChat() {
  const { user, token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [status, setStatus] = useState(STATUS.IDLE)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [currentRoomId, setCurrentRoomId] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)

  const [language, setLanguage] = useState('Any')
  const [interests, setInterests] = useState([])
  const [customInterest, setCustomInterest] = useState('')
  const [preference, setPreference] = useState('relaxed')

  const partnerSocketIdRef = useRef(null)
  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const [sharedKey, setSharedKey] = useState(null) // ephemeral AES-GCM key for this session
  const sharedKeyRef = useRef(null) // ref so async callbacks always see latest key

  // Keep ref in sync with state
  useEffect(() => { sharedKeyRef.current = sharedKey }, [sharedKey])

  const allowRandomMatch = user?.privacySettings?.allowRandomMatch !== false

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const socket = getSocket(token)
    socketRef.current = socket

    socket.on('random_waiting', ({ message }) => {
      setStatus(STATUS.WAITING)
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.type === 'system' && last.text === message) return prev
        return [...prev, { type: 'system', text: message, timestamp: new Date(), _id: `sys_${Date.now()}` }]
      })
    })

    socket.on('random_matched', async ({ roomId, partnerSocketId }) => {
      setCurrentRoomId(roomId)
      setStatus(STATUS.CHATTING)
      partnerSocketIdRef.current = partnerSocketId || null
      setSharedKey(null) // reset key for new session

      // Initiate E2E key exchange — send our public key to partner
      try {
        const myPublicKey = await getOrCreateKeyPair()
        socket.emit('exchange_key', { to: partnerSocketId, publicKey: myPublicKey })
      } catch (err) {
        console.warn('Key exchange initiation failed:', err)
      }
    })

    // Handle incoming public key from partner — derive shared AES-GCM key
    socket.on('exchange_key', async ({ from, publicKey }) => {
      try {
        const key = await deriveSharedKey(publicKey)
        setSharedKey(key)
      } catch (err) {
        console.warn('Key derivation failed:', err)
      }
    })

    socket.on('receive_message', async (msg) => {
      if (msg.sender !== user.username) {
        let finalMsg = { ...msg, _id: msg._id || `msg_${Date.now()}` }
        // Decrypt if encrypted
        if (msg.encrypted && msg.iv) {
          // Use current sharedKey from closure — may not be set yet; use ref
          const currentKey = sharedKeyRef.current
          if (currentKey) {
            const plain = await decryptMessage(msg.iv, msg.text, currentKey)
            finalMsg = { ...finalMsg, text: plain ?? '🔒 (encrypted)' }
          }
        }
        setMessages(prev => [...prev, finalMsg])
      }
    })

    socket.on('random_partner_left', () => {
      setStatus(STATUS.DISCONNECTED)
      setCurrentRoomId(null)
      setSharedKey(null)
    })

    socket.on('error', ({ message }) => toast(message, 'error'))

    return () => {
      socket.off('random_waiting')
      socket.off('random_matched')
      socket.off('exchange_key')
      socket.off('receive_message')
      socket.off('random_partner_left')
      socket.off('error')
    }
  }, [token, user.username, toast])

  const startMatching = useCallback((skipSocketId = null) => {
    if (!allowRandomMatch) { setStatus(STATUS.BLOCKED); return }
    const socket = socketRef.current
    if (!socket) return
    setMessages([])
    setCurrentRoomId(null)
    partnerSocketIdRef.current = null
    setStatus(STATUS.WAITING)
    socket.emit('join_random', { username: user.username, interests, language, preference, skipSocketId })
  }, [user.username, interests, language, preference, allowRandomMatch])

  const addInterest = (tag) => {
    const t = tag.toLowerCase().trim()
    if (!t || interests.includes(t)) return
    setInterests(prev => [...prev, t])
  }

  const removeInterest = (tag) => setInterests(prev => prev.filter(i => i !== tag))

  const handleCustomInterestKey = (e) => {
    if (e.key === 'Enter' && customInterest.trim()) {
      e.preventDefault()
      addInterest(customInterest)
      setCustomInterest('')
    }
  }

  const sendMessage = useCallback(async () => {
    const socket = socketRef.current
    if (!socket || !text.trim() || !currentRoomId) return
    const msgText = text.trim()

    // Encrypt if we have a shared key
    let finalText = msgText
    let msgIv = null
    let isEncrypted = false
    if (sharedKey) {
      try {
        const { iv, ciphertext } = await encryptMessage(msgText, sharedKey)
        finalText = ciphertext
        msgIv = iv
        isEncrypted = true
      } catch (err) {
        console.warn('Encryption failed, sending plaintext:', err)
      }
    }

    // Add to local messages immediately (plaintext for sender)
    setMessages(prev => [...prev, { type: 'text', text: msgText, timestamp: new Date(), _id: `me_${Date.now()}`, sender: user.username }])
    socket.emit('send_message', { roomId: currentRoomId, text: finalText, isAnonymous: true, displayName: 'You', encrypted: isEncrypted, iv: msgIv })
    setText('')
  }, [text, currentRoomId, user.username, sharedKey])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleDisconnect = () => {
    socketRef.current?.emit('leave_random')
    setStatus(STATUS.DISCONNECTED)
    setCurrentRoomId(null)
    setMessages(prev => [...prev, { type: 'system', text: 'You disconnected.', timestamp: new Date(), _id: `dc_${Date.now()}` }])
  }

  const handleBlockStranger = () => {
    handleDisconnect()
    toast('Stranger blocked for this session', 'info')
  }

  const handleNext = () => {
    const prevPartner = partnerSocketIdRef.current
    socketRef.current?.emit('leave_random')
    setCurrentRoomId(null)
    setMessages([{ type: 'system', text: '⏭️ Finding a new match…', timestamp: new Date(), _id: `skip_${Date.now()}` }])
    setStatus(STATUS.WAITING)
    setTimeout(() => startMatching(prevPartner), 100)
  }

  const handleCancelWait = () => {
    socketRef.current?.emit('leave_random')
    setStatus(STATUS.IDLE)
    setMessages([])
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* ---- Header ---- */}
      <header className="glass-strong shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost btn-icon" onClick={() => { handleDisconnect(); navigate('/') }}>
              <ArrowLeft size={15} />
            </button>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-sm">
                <Zap size={13} style={{ color: 'var(--accent2)' }} /> Random Chat
                {status === STATUS.CHATTING && sharedKey && (
                  <span
                    title="End-to-End Encrypted"
                    style={{
                      fontSize: 10, fontWeight: 600,
                      color: '#22c55e',
                      background: 'rgba(34,197,94,0.1)',
                      border: '1px solid rgba(34,197,94,0.25)',
                      borderRadius: 6,
                      padding: '1px 6px',
                      letterSpacing: '0.02em',
                    }}
                  >🔒 E2E</span>
                )}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {status === STATUS.IDLE && 'Configure & connect'}
                {status === STATUS.WAITING && '🔍 Matching…'}
                {status === STATUS.CHATTING && '🟢 Connected'}
                {status === STATUS.DISCONNECTED && '🔴 Disconnected'}
                {status === STATUS.BLOCKED && '🔒 Disabled'}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {status === STATUS.WAITING && (
              <button className="btn btn-ghost text-xs" style={{ height: 32, padding: '0 10px' }} onClick={handleCancelWait}>
                <X size={13} /> Cancel
              </button>
            )}
            {status === STATUS.CHATTING && (
              <>
                <button className="btn btn-ghost btn-icon" style={{ width: 32, height: 32 }} onClick={() => setShowReportModal(true)} title="Report">
                  <Flag size={13} />
                </button>
                <button className="btn btn-ghost btn-icon" style={{ width: 32, height: 32 }} onClick={handleBlockStranger} title="Block">
                  <UserX size={13} />
                </button>
                <button className="btn btn-ghost text-xs" style={{ height: 32, padding: '0 10px' }} onClick={handleNext}>
                  <RefreshCw size={12} /> Next
                </button>
                <button className="btn btn-danger text-xs" style={{ height: 32, padding: '0 10px' }} onClick={handleDisconnect}>
                  <X size={12} /> End
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---- Body ---- */}
      <div className="flex-1 overflow-y-auto pt-3 pb-1">

        {/* BLOCKED */}
        {status === STATUS.BLOCKED && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm px-5 animate-fade-in">
              <ShieldOff size={40} className="mx-auto mb-4 opacity-50" style={{ color: 'var(--warning)' }} />
              <h2 className="font-bold text-lg mb-2">Random Matching Disabled</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Enable random matching in your privacy settings to start chatting.
              </p>
              <div className="flex gap-2 justify-center">
                <button className="btn btn-primary" onClick={() => navigate('/privacy')}><Zap size={14} /> Privacy Settings</button>
                <button className="btn btn-ghost" onClick={() => navigate('/')}><ArrowLeft size={14} /> Home</button>
              </div>
            </div>
          </div>
        )}

        {/* IDLE — Config */}
        {status === STATUS.IDLE && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md w-full px-5 animate-fade-in">
              <div className="text-5xl mb-3">🎲</div>
              <h2 className="font-bold font-display text-xl mb-1">Meet a Stranger</h2>
              <p className="text-xs mb-6" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Set preferences for smarter matching.
              </p>

              {!allowRandomMatch && (
                <div className="anon-banner mb-5 justify-center">
                  <ShieldOff size={15} />
                  <span className="text-xs">Random matching is disabled in your <button onClick={() => navigate('/privacy')} className="underline font-semibold" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>privacy settings</button></span>
                </div>
              )}

              {/* Language */}
              <div className="text-left mb-4">
                <label className="flex items-center gap-1.5 text-sm font-semibold mb-1.5"><Globe size={13} /> Language</label>
                <select className="inp w-full text-sm" style={{ height: 40, cursor: 'pointer' }} value={language} onChange={e => setLanguage(e.target.value)}>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Interests */}
              <div className="text-left mb-4">
                <label className="flex items-center gap-1.5 text-sm font-semibold mb-1.5">
                  <Hash size={13} /> Interests
                  <span className="text-[11px] font-normal opacity-50 ml-1">({interests.length} selected)</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
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
                  className="inp w-full text-xs"
                  style={{ height: 34 }}
                  placeholder="Custom interest — press Enter"
                  value={customInterest}
                  onChange={e => setCustomInterest(e.target.value)}
                  onKeyDown={handleCustomInterestKey}
                />
                {interests.filter(i => !INTEREST_SUGGESTIONS.includes(i)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {interests.filter(i => !INTEREST_SUGGESTIONS.includes(i)).map(tag => (
                      <InterestTag key={tag} label={tag} selected onClick={() => removeInterest(tag)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Strictness */}
              <div className="text-left mb-5">
                <label className="flex items-center gap-1.5 text-sm font-semibold mb-1.5"><SlidersHorizontal size={13} /> Match Strictness</label>
                <div className="flex gap-2">
                  {[
                    { key: 'relaxed', emoji: '🌐', label: 'Relaxed', sub: 'Match anyone', color: 'var(--accent)' },
                    { key: 'strict', emoji: '🎯', label: 'Strict', sub: 'Only similar interests', color: 'var(--warning)' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setPreference(opt.key)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all text-center"
                      style={{
                        border: preference === opt.key ? `2px solid ${opt.color}` : '2px solid var(--border)',
                        background: preference === opt.key ? `${opt.color}15` : 'transparent',
                        color: preference === opt.key ? opt.color : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.emoji} {opt.label}
                      <div className="text-[10px] font-normal mt-0.5 opacity-60">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary w-full"
                style={{ height: 46, fontSize: 15, background: 'linear-gradient(135deg, #6c63ff, #38bdf8)' }}
                onClick={() => startMatching(null)}
                disabled={!allowRandomMatch}
              >
                <Zap size={17} /> Start Chatting
              </button>
            </div>
          </div>
        )}

        {/* WAITING */}
        {status === STATUS.WAITING && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm animate-fade-in">
              <div className="spinner spinner-lg mx-auto mb-5" style={{ color: 'var(--accent)', borderColor: 'rgba(108,99,255,0.2)', borderTopColor: 'var(--accent)' }} />
              <p className="font-semibold mb-1">Finding your best match…</p>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Usually just a few seconds</p>
              {(interests.length > 0 || language !== 'Any') && (
                <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                  {language !== 'Any' && (
                    <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(108,99,255,0.1)', color: 'var(--accent)' }}>🌐 {language}</span>
                  )}
                  {interests.slice(0, 6).map(i => (
                    <span key={i} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>#{i}</span>
                  ))}
                  {interests.length > 6 && (
                    <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)' }}>+{interests.length - 6}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHATTING / DISCONNECTED */}
        {(status === STATUS.CHATTING || status === STATUS.DISCONNECTED) && (
          <div className="flex flex-col gap-0.5">
            {messages.map((msg, i) => (
              <MessageBubble key={msg._id || i} msg={msg} isMe={msg.sender === user.username} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ---- Input ---- */}
      {status === STATUS.CHATTING && (
        <div className="glass-strong border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2 items-center px-4 py-2.5 max-w-3xl mx-auto">
            <input
              className="inp flex-1"
              style={{ height: 40 }}
              placeholder="Say something…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="btn btn-primary btn-icon"
              style={{ width: 40, height: 40 }}
              onClick={sendMessage}
              disabled={!text.trim()}
            >
              <Send size={15} />
            </button>
          </div>
          <p className="text-center text-[11px] pb-1.5" style={{ color: 'var(--text-dim)' }}>
            🎭 You are completely anonymous
          </p>
        </div>
      )}

      {status === STATUS.DISCONNECTED && (
        <div className="glass-strong border-t shrink-0 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2 justify-center">
            <button className="btn btn-primary" onClick={() => { setStatus(STATUS.IDLE); setMessages([]) }}>
              <Zap size={14} /> New Stranger
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              <ArrowLeft size={14} /> Home
            </button>
          </div>
        </div>
      )}

      {showReportModal && (
        <ReportModal onClose={() => setShowReportModal(false)} token={token} toast={toast} />
      )}
    </div>
  )
}
