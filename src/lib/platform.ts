import type { Platform } from '../types/database'

// The DB platform enum stays generic by design, but SubShare only accepts
// YouTube links — detectPlatform classifies anything else as 'other'.

/** Detect whether a pasted link is YouTube (null-safe, never throws). */
export function detectPlatform(rawUrl: string): Platform {
  try {
    const host = new URL(rawUrl.trim()).hostname.replace(/^www\./, '').toLowerCase()
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(host) || host === 'youtu.be') return 'youtube'
    return 'other'
  } catch {
    return 'other'
  }
}

// Labels for every enum value the DB can hold (legacy-safe).
export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  github: 'GitHub',
  spotify: 'Spotify',
  x: 'X',
  tiktok: 'TikTok',
  other: 'Link',
}

/** True if the URL points at YouTube (youtube.com, youtu.be, youtube-nocookie.com). */
export function isYouTubeUrl(value: string): boolean {
  try {
    const host = new URL(value.trim()).hostname.replace(/^www\.|^m\./, '').toLowerCase()
    return host === 'youtu.be' || /(^|\.)youtube(-nocookie)?\.com$/.test(host)
  } catch {
    return false
  }
}

/** True if the string looks like a usable http(s) URL. */
export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
