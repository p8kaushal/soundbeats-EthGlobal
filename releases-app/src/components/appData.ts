import type { Catalog } from '../hooks/useCatalog'
import type { MyState } from '../hooks/useMe'
import type { Release, Song } from '../contracts/soundBeats'
import { decodeSongMeta } from '../lib/metadata'
import { shortAddress } from '../lib/format'

/** Everything a page needs: contract catalog, the wallet's own state, and lookups. */
export interface AppData {
  catalog: Catalog
  me: MyState
  address?: `0x${string}`
  songById: Map<number, Song>
  loading: boolean
}

export function artistLabel(song: Song | undefined, fallback?: string): string {
  if (!song) return fallback ? shortAddress(fallback) : 'Unknown artist'
  return decodeSongMeta(song.metadataURI).artistName ?? shortAddress(song.artist)
}

export function releaseTitle(release: Release, songById: Map<number, Song>): string {
  return songById.get(release.songId)?.title ?? `Song #${release.songId}`
}
