// Shared crypto for SubShare Edge Functions.
// - AES-GCM encrypt/decrypt of OAuth tokens using the PLATFORM_ENCRYPTION_KEY
//   secret (32 random bytes, base64). Any non-32-byte secret is hashed to a
//   key, so a passphrase also works (base64 recommended).
// - HMAC-signed OAuth "state" parameters (same secret, different derivation).

const enc = new TextEncoder()
const dec = new TextDecoder()

// ---------- base64url ----------
function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array {
  let s = value.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4 !== 0) s += '='
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ---------- master key ----------
let cachedAesKey: CryptoKey | null = null

async function masterKey(): Promise<CryptoKey> {
  if (cachedAesKey) return cachedAesKey
  const secret = Deno.env.get('PLATFORM_ENCRYPTION_KEY') ?? ''
  if (secret === '') throw new Error('PLATFORM_ENCRYPTION_KEY secret is not set')
  let raw: Uint8Array | null = null
  try {
    const bin = atob(secret)
    if (bin.length === 32) {
      raw = new Uint8Array(32)
      for (let i = 0; i < 32; i++) raw[i] = bin.charCodeAt(i)
    }
  } catch {
    // not base64 — fall through and hash the raw string
  }
  if (raw === null) {
    raw = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(secret)))
  }
  cachedAesKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
  return cachedAesKey
}

/** Encrypt a short secret (OAuth token). Output: iv||ct as base64url. */
export async function encryptText(plain: string): Promise<string> {
  const key = await masterKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return base64UrlEncode(out)
}

/** Decrypt output of encryptText. Throws if the key changed or data is corrupt. */
export async function decryptText(payload: string): Promise<string> {
  const key = await masterKey()
  const data = base64UrlDecode(payload)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.slice(0, 12) },
    key,
    data.slice(12),
  )
  return dec.decode(plain)
}

// ---------- HMAC-signed OAuth state ----------
export interface OAuthState {
  uid: string
  platform: string
  /** App origin the browser should land back on. */
  returnTo: string
  nonce: string
}

let cachedHmacKey: CryptoKey | null = null

async function stateKey(): Promise<CryptoKey> {
  if (cachedHmacKey) return cachedHmacKey
  const secret = Deno.env.get('PLATFORM_ENCRYPTION_KEY') ?? ''
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`oauth-state:${secret}`))
  cachedHmacKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(digest),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return cachedHmacKey
}

/** Sign a state payload -> "<payload>.<signature>" (both base64url). */
export async function signState(payload: OAuthState): Promise<string> {
  const key = await stateKey()
  const body = base64UrlEncode(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return `${body}.${base64UrlEncode(new Uint8Array(sig))}`
}

/** Verify + parse a state token. Returns null for anything forged/tampered. */
export async function verifyState(token: string | null): Promise<OAuthState | null> {
  if (token === null) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const key = await stateKey()
  let expected: ArrayBuffer
  try {
    expected = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  } catch {
    return null
  }
  let given: Uint8Array
  try {
    given = base64UrlDecode(sig)
  } catch {
    return null
  }
  const valid = await crypto.subtle.verify('HMAC', key, given, enc.encode(body))
  if (!valid) return null
  try {
    const parsed = JSON.parse(dec.decode(base64UrlDecode(body))) as OAuthState
    if (typeof parsed?.uid !== 'string' || typeof parsed?.platform !== 'string') return null
    return parsed
  } catch {
    return null
  }
}
