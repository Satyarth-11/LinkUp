import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

let socket = null
let currentToken = null

export function getSocket(token = null) {
  // Create new socket only when none exists or token changed (re-login)
  if (!socket || (token && token !== currentToken)) {
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
    }
    currentToken = token
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
    currentToken = null
  }
}

export function getExistingSocket() {
  return socket
}
