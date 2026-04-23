import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Phone, PhoneOff, PhoneIncoming, Video, VideoOff,
  Mic, MicOff, X, Maximize2, Minimize2
} from 'lucide-react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

const CALL_STATE = {
  IDLE: 'idle',
  CALLING: 'calling',
  INCOMING: 'incoming',
  CONNECTED: 'connected',
}

/* ---- Incoming Call Notification ---- */
function IncomingCallNotification({ callerName, onAccept, onReject }) {
  return (
    <div className="call-incoming-overlay">
      <div className="call-incoming-card">
        <div className="call-incoming-pulse" />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📞</div>
          <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: 'var(--text)' }}>
            Incoming Video Call
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
            <strong>{callerName}</strong> is calling you
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button
              className="call-btn call-btn-reject"
              onClick={onReject}
              title="Decline"
            >
              <PhoneOff size={22} />
            </button>
            <button
              className="call-btn call-btn-accept"
              onClick={onAccept}
              title="Accept"
            >
              <Phone size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---- Active Call UI ---- */
function ActiveCallUI({
  localVideoRef,
  remoteVideoRef,
  isVideoEnabled,
  isAudioEnabled,
  onToggleVideo,
  onToggleAudio,
  onEndCall,
  callerName,
  callState,
  isFullscreen,
  onToggleFullscreen,
}) {
  return (
    <div className={`call-container ${isFullscreen ? 'call-fullscreen' : ''}`}>
      {/* Remote video (big) */}
      <div className="call-remote-video">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {callState === CALL_STATE.CALLING && (
          <div className="call-status-overlay">
            <div style={{ width: 50, height: 50, borderRadius: '50%', border: '3px solid rgba(108,99,255,0.3)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 600, fontSize: 16 }}>Calling {callerName}...</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Waiting for response</p>
          </div>
        )}
        {callState === CALL_STATE.CONNECTED && (
          <div className="call-connected-label">
            <span className="online-dot" style={{ width: 6, height: 6 }} />
            <span>{callerName}</span>
          </div>
        )}
      </div>

      {/* Local video (small PIP) */}
      <div className="call-local-video">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        {!isVideoEnabled && (
          <div className="call-cam-off-indicator">
            <VideoOff size={20} />
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="call-controls">
        <button
          className={`call-ctrl-btn ${!isAudioEnabled ? 'call-ctrl-off' : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Mute' : 'Unmute'}
        >
          {isAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          className={`call-ctrl-btn ${!isVideoEnabled ? 'call-ctrl-off' : ''}`}
          onClick={onToggleVideo}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button
          className="call-ctrl-btn call-ctrl-end"
          onClick={onEndCall}
          title="End call"
        >
          <PhoneOff size={20} />
        </button>
        <button
          className="call-ctrl-btn"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>
    </div>
  )
}

/* ---- Main VideoCall Component ---- */
export default function VideoCall({ socket, currentSocketId, currentUsername, targetSocketId, targetName, roomId, onCallStateChange }) {
  const [callState, setCallState] = useState(CALL_STATE.IDLE)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [incomingCallData, setIncomingCallData] = useState(null)
  const [error, setError] = useState(null)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const pendingCandidatesRef = useRef([])
  const partnerSocketIdRef = useRef(null)

  // Helper to notify parent of call state changes
  const updateCallState = useCallback((state) => {
    setCallState(state)
    onCallStateChange?.(state)
  }, [onCallStateChange])

  /* ---- Cleanup everything ---- */
  const cleanup = useCallback(() => {
    // Stop local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null
      peerConnectionRef.current.onicecandidate = null
      peerConnectionRef.current.onconnectionstatechange = null
      peerConnectionRef.current.oniceconnectionstatechange = null
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    // Clear video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null

    pendingCandidatesRef.current = []
    partnerSocketIdRef.current = null
  }, [])

  /* ---- Get user media ---- */
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (err) {
      console.error('getUserMedia error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Camera/microphone permission denied. Please allow access and try again.')
      } else if (err.name === 'NotFoundError') {
        setError('No camera or microphone found on this device.')
      } else {
        setError('Could not access camera/microphone.')
      }
      throw err
    }
  }, [])

  /* ---- Create peer connection ---- */
  const createPeerConnection = useCallback((partnerId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('iceCandidate', {
          to: partnerId,
          candidate: event.candidate,
        })
      }
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0]
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        updateCallState(CALL_STATE.CONNECTED)
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall()
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce()
      }
    }

    peerConnectionRef.current = pc
    return pc
  }, [socket, updateCallState])

  /* ---- Start outgoing call ---- */
  const startCall = useCallback(async () => {
    if (!targetSocketId || !socket) return
    setError(null)

    try {
      const stream = await getLocalStream()
      const pc = createPeerConnection(targetSocketId)
      partnerSocketIdRef.current = targetSocketId

      // Add local tracks to peer connection
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await pc.setLocalDescription(offer)

      socket.emit('callUser', {
        targetSocketId,
        offer: pc.localDescription,
        callerName: currentUsername || 'User',
        roomId,
      })

      updateCallState(CALL_STATE.CALLING)
    } catch (err) {
      console.error('Start call error:', err)
      cleanup()
      updateCallState(CALL_STATE.IDLE)
    }
  }, [targetSocketId, socket, getLocalStream, createPeerConnection, currentUsername, roomId, updateCallState, cleanup])

  /* ---- Accept incoming call ---- */
  const acceptCall = useCallback(async () => {
    if (!incomingCallData || !socket) return
    setError(null)

    try {
      const stream = await getLocalStream()
      const pc = createPeerConnection(incomingCallData.from)
      partnerSocketIdRef.current = incomingCallData.from

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // Set remote description from offer
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer))

      // Flush any pending ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
      pendingCandidatesRef.current = []

      // Create and send answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      socket.emit('acceptCall', {
        to: incomingCallData.from,
        answer: pc.localDescription,
      })

      updateCallState(CALL_STATE.CONNECTED)
      setIncomingCallData(null)
    } catch (err) {
      console.error('Accept call error:', err)
      cleanup()
      updateCallState(CALL_STATE.IDLE)
      setIncomingCallData(null)
    }
  }, [incomingCallData, socket, getLocalStream, createPeerConnection, updateCallState, cleanup])

  /* ---- Reject incoming call ---- */
  const rejectCall = useCallback(() => {
    if (!incomingCallData || !socket) return
    socket.emit('rejectCall', { to: incomingCallData.from })
    setIncomingCallData(null)
    cleanup()
    updateCallState(CALL_STATE.IDLE)
  }, [incomingCallData, socket, cleanup, updateCallState])

  /* ---- End call ---- */
  const endCall = useCallback(() => {
    const partnerId = partnerSocketIdRef.current
    if (socket && partnerId) {
      socket.emit('endCall', { to: partnerId })
    }
    cleanup()
    updateCallState(CALL_STATE.IDLE)
    setIncomingCallData(null)
  }, [socket, cleanup, updateCallState])

  /* ---- Toggle video ---- */
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }, [])

  /* ---- Toggle audio ---- */
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
  }, [])

  /* ---- Socket event listeners ---- */
  useEffect(() => {
    if (!socket) return

    const handleIncomingCall = (data) => {
      // If already in a call, auto-reject
      if (callState !== CALL_STATE.IDLE) {
        socket.emit('rejectCall', { to: data.from })
        return
      }
      setIncomingCallData(data)
      updateCallState(CALL_STATE.INCOMING)
    }

    const handleCallAccepted = async ({ from, answer }) => {
      const pc = peerConnectionRef.current
      if (!pc) return

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))

        // Flush pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        pendingCandidatesRef.current = []

        updateCallState(CALL_STATE.CONNECTED)
      } catch (err) {
        console.error('Handle call accepted error:', err)
        endCall()
      }
    }

    const handleCallRejected = () => {
      cleanup()
      updateCallState(CALL_STATE.IDLE)
    }

    const handleCallEnded = () => {
      cleanup()
      updateCallState(CALL_STATE.IDLE)
      setIncomingCallData(null)
    }

    const handleIceCandidate = async ({ candidate }) => {
      const pc = peerConnectionRef.current
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('Add ICE candidate error:', err)
        }
      } else {
        // Buffer candidates until remote description is set
        pendingCandidatesRef.current.push(candidate)
      }
    }

    const handleCallError = ({ message }) => {
      setError(message)
      cleanup()
      updateCallState(CALL_STATE.IDLE)
    }

    socket.on('incomingCall', handleIncomingCall)
    socket.on('callAccepted', handleCallAccepted)
    socket.on('callRejected', handleCallRejected)
    socket.on('callEnded', handleCallEnded)
    socket.on('iceCandidate', handleIceCandidate)
    socket.on('callError', handleCallError)

    return () => {
      socket.off('incomingCall', handleIncomingCall)
      socket.off('callAccepted', handleCallAccepted)
      socket.off('callRejected', handleCallRejected)
      socket.off('callEnded', handleCallEnded)
      socket.off('iceCandidate', handleIceCandidate)
      socket.off('callError', handleCallError)
    }
  }, [socket, callState, cleanup, updateCallState, endCall])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const partnerId = partnerSocketIdRef.current
      if (socket && partnerId) {
        socket.emit('endCall', { to: partnerId })
      }
      cleanup()
    }
  }, [cleanup, socket])

  return (
    <>
      {/* Error toast */}
      {error && (
        <div className="call-error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 8 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Incoming call notification */}
      {callState === CALL_STATE.INCOMING && incomingCallData && (
        <IncomingCallNotification
          callerName={incomingCallData.callerName}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* Active call UI (calling or connected) */}
      {(callState === CALL_STATE.CALLING || callState === CALL_STATE.CONNECTED) && (
        <ActiveCallUI
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          onToggleVideo={toggleVideo}
          onToggleAudio={toggleAudio}
          onEndCall={endCall}
          callerName={targetName || 'User'}
          callState={callState}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(f => !f)}
        />
      )}

      {/* Call button — shown when idle and we have a target */}
      {callState === CALL_STATE.IDLE && targetSocketId && (
        <button
          className="call-start-btn"
          onClick={startCall}
          title="Start video call"
        >
          <Video size={16} />
        </button>
      )}
    </>
  )
}

export { CALL_STATE }
