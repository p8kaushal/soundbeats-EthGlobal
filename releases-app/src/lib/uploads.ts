/**
 * Client for the SoundBeats releases API (same domain, /api). Media files go to private S3
 * through the API; the song itself is registered onchain from the artist's own wallet.
 */

export interface UploadRecord {
  id: string
  status: 'draft' | 'uploaded' | 'registered'
  title: string
  artistName: string
  genre: string
  wallet: string
  audio: { url: string; size: number; sha256: string } | null
  artwork: { url: string; size: number; sha256: string } | null
  arc: { songId: number; txHash: string; blockNumber: number; artist: string } | null
  arkiv: { entityKey: string; txHash: string | null; url: string | null; schema: string } | null
  arkivError: string | null
}

export const AUDIO_LIMIT = 25 * 1024 * 1024
export const ARTWORK_LIMIT = 5 * 1024 * 1024
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3']
export const ARTWORK_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new Error('Could not reach the SoundBeats server. Check your connection and try again.')
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `The server returned ${res.status}.`)
  return body as T
}

export const createDraft = (input: { title: string; artistName: string; genre: string; wallet: string }) =>
  call<UploadRecord>('/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })

export const uploadFile = (id: string, kind: 'audio' | 'artwork', file: File) =>
  call<UploadRecord>(`/uploads/${id}/${kind}`, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })

export const finalizeUpload = (id: string, txHash: string) =>
  call<UploadRecord>(`/uploads/${id}/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash }) })

export const getUpload = (id: string) => call<UploadRecord>(`/uploads/${id}`)

/** Arc may take a few seconds to make a fresh receipt visible to the server, so retry briefly. */
export async function finalizeWithRetry(id: string, txHash: string, attempts = 5): Promise<UploadRecord> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await finalizeUpload(id, txHash)
    } catch (error) {
      last = error
      if (!(error instanceof Error) || !/not confirmed this transaction yet/i.test(error.message)) throw error
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  throw last instanceof Error ? last : new Error('Could not finish saving the song.')
}

export function checkFile(file: File | null, kind: 'audio' | 'artwork'): string | null {
  if (!file) return kind === 'audio' ? 'Choose an MP3 file.' : 'Choose a cover image.'
  const limit = kind === 'audio' ? AUDIO_LIMIT : ARTWORK_LIMIT
  const types = kind === 'audio' ? AUDIO_TYPES : ARTWORK_TYPES
  const okType = types.includes(file.type) || (kind === 'audio' && /\.mp3$/i.test(file.name))
  if (!okType) return kind === 'audio' ? 'The song must be an MP3.' : 'The cover must be JPG, PNG or WebP.'
  if (file.size > limit) return `${kind === 'audio' ? 'The song' : 'The cover'} must be under ${limit / 1024 / 1024} MB.`
  return null
}
