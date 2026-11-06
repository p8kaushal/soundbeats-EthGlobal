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
}

const PREFIX = 'data:application/json,'

export function encodeSongMeta(meta: SongMeta): string {
  return PREFIX + encodeURIComponent(JSON.stringify(meta))
}

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
