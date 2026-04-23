/**
 * LinkUp E2E Encryption Utility
 * Uses Web Crypto API (built-in to all browsers & Android WebView)
 * - ECDH P-256 for key exchange
 * - AES-GCM 256-bit for message encryption
 * Private keys NEVER leave the device.
 */

const PRIVATE_KEY_STORAGE = 'linkup_e2e_private'
const PUBLIC_KEY_STORAGE = 'linkup_e2e_public'

// ── Key Generation ────────────────────────────────────────────────────────────

/**
 * Generate a new ECDH P-256 keypair.
 * Stores private key in localStorage, returns public key as JWK string.
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable
    ['deriveKey']
  )

  // Export and store private key
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  localStorage.setItem(PRIVATE_KEY_STORAGE, JSON.stringify(privateJwk))

  // Export public key
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const publicKeyStr = JSON.stringify(publicJwk)
  localStorage.setItem(PUBLIC_KEY_STORAGE, publicKeyStr)

  return publicKeyStr
}

/**
 * Returns existing public key JWK string, or generates a new keypair.
 */
export async function getOrCreateKeyPair() {
  const storedPrivate = localStorage.getItem(PRIVATE_KEY_STORAGE)
  const storedPublic = localStorage.getItem(PUBLIC_KEY_STORAGE)

  if (storedPrivate && storedPublic) {
    // Validate they parse correctly
    try {
      JSON.parse(storedPrivate)
      JSON.parse(storedPublic)
      return storedPublic
    } catch {
      // Corrupt — regenerate
    }
  }
  return generateKeyPair()
}

/**
 * Get the stored public key JWK string (or null if not generated yet).
 */
export function getStoredPublicKey() {
  return localStorage.getItem(PUBLIC_KEY_STORAGE)
}

/**
 * Clear all E2E keys from localStorage (call on logout).
 */
export function clearKeys() {
  localStorage.removeItem(PRIVATE_KEY_STORAGE)
  localStorage.removeItem(PUBLIC_KEY_STORAGE)
}

// ── Key Derivation ────────────────────────────────────────────────────────────

// Cache derived keys so we don't re-derive on every message
const derivedKeyCache = new Map()

/**
 * Derive a shared AES-GCM key from our private key + partner's public key JWK string.
 * Result is cached by partnerPublicKeyStr.
 */
export async function deriveSharedKey(partnerPublicKeyStr) {
  if (derivedKeyCache.has(partnerPublicKeyStr)) {
    return derivedKeyCache.get(partnerPublicKeyStr)
  }

  const privateJwkStr = localStorage.getItem(PRIVATE_KEY_STORAGE)
  if (!privateJwkStr) throw new Error('No private key found. Please log in again.')

  const privateJwk = JSON.parse(privateJwkStr)
  const partnerPublicJwk = JSON.parse(partnerPublicKeyStr)

  const myPrivateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey']
  )

  const theirPublicKey = await crypto.subtle.importKey(
    'jwk',
    partnerPublicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  derivedKeyCache.set(partnerPublicKeyStr, sharedKey)
  return sharedKey
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using an AES-GCM CryptoKey.
 * Returns { iv, ciphertext } — both base64 encoded.
 */
export async function encryptMessage(plaintext, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  )

  return {
    iv: arrayToBase64(iv),
    ciphertext: arrayToBase64(new Uint8Array(ciphertextBuffer)),
  }
}

/**
 * Decrypt a message using an AES-GCM CryptoKey.
 * Returns plaintext string, or null on failure.
 */
export async function decryptMessage(ivBase64, ciphertextBase64, aesKey) {
  try {
    const iv = base64ToArray(ivBase64)
    const ciphertext = base64ToArray(ciphertextBase64)

    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    )

    return new TextDecoder().decode(plaintextBuffer)
  } catch {
    return null // decryption failure (wrong key, corrupt data)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function arrayToBase64(uint8Array) {
  return btoa(String.fromCharCode(...uint8Array))
}

function base64ToArray(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}
