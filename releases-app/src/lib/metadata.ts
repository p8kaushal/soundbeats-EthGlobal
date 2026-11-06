/**
 * Song metadata is stored onchain as a `data:application/json,` URI so the catalog needs
 * no external hosting. Other schemes (https, ipfs) are accepted by the contract but are
 * not fetched by the app.
 */

export interface SongMeta {
  artistName?: string
  album?: string
  cover?: string
  genre?: string
  bpm?: number
  /** Artist upload id on the SoundBeats releases API (media lives in private S3). */
  uploadId?: string
  /** Streamable audio URL, derived from uploadId (not stored onchain, to stay under the 512-byte limit). */
  audio?: string
}

const PREFIX = 'data:application/json,'

/** Where uploaded media is served from (the releases API behind the site's own domain). */
export const MEDIA_ORIGIN = 'https://arc.ethglobal.soundbeats.io'
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The contract rejects metadata URIs longer than this many bytes. */
export const MAX_METADATA_BYTES = 512

export function encodeSongMeta(meta: SongMeta): string {
  const { audio: _derived, ...stored } = meta
  void _derived
  return PREFIX + encodeURIComponent(JSON.stringify(stored))
}

export const metadataBytes = (uri: string) => new TextEncoder().encode(uri).length

export function decodeSongMeta(uri: string): SongMeta {
  if (!uri.startsWith(PREFIX)) return {}
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(uri.slice(PREFIX.length)))
    if (typeof parsed !== 'object' || parsed === null) return {}
    const record = parsed as Record<string, unknown>
    return {
      artistName: typeof record.artistName === 'string' ? record.artistName : undefined,
      cover: typeof record.cover === 'string' ? record.cover : undefined,
      album: typeof record.album === 'string' ? record.album : undefined,
      genre: typeof record.genre === 'string' ? record.genre : undefined,
      bpm: typeof record.bpm === 'number' ? record.bpm : undefined,
      uploadId: typeof record.uploadId === 'string' ? record.uploadId : undefined,
      audio: typeof record.uploadId === 'string' && UPLOAD_ID.test(record.uploadId) ? `${MEDIA_ORIGIN}/api/media/${record.uploadId}/audio` : undefined,
    }
  } catch {
    return {}
  }
}

/** Logos are user-supplied URIs, so only render well-known safe schemes. */
export function safeImageUrl(uri: string): string | null {
  const value = uri.trim()
  if (value.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${value.slice(7)}`
  if (/^https:\/\//i.test(value)) return value
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(value)) return value
  return null
}
