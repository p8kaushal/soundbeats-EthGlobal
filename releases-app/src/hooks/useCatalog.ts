import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import {
  CHAIN_ID,
  SOUNDBEATS_ADDRESS,
  soundBeatsAbi,
  type PassStats,
  type Release,
  type Song,
  type Sponsorship,
} from '../contracts/soundBeats'

export interface Catalog {
  songs: Song[]
  releases: Release[]
  passStats: Record<number, PassStats>
  sponsorships: Record<number, Sponsorship[]>
}

const EMPTY: Catalog = { songs: [], releases: [], passStats: {}, sponsorships: {} }

const ids = (count: bigint): number[] => Array.from({ length: Number(count) }, (_, i) => i + 1)

/** Reads the whole catalog from the contract. Small by design: the demo catalog is a handful of rows. */
export function useCatalog() {
  const client = usePublicClient({ chainId: CHAIN_ID })

  const query = useQuery({
    queryKey: ['catalog'],
    enabled: !!client,
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Catalog> => {
      if (!client) return EMPTY
      const base = { address: SOUNDBEATS_ADDRESS, abi: soundBeatsAbi } as const

      const [songCount, releaseCount] = await Promise.all([
        client.readContract({ ...base, functionName: 'songCount' }),
        client.readContract({ ...base, functionName: 'releaseCount' }),
      ])
      const releaseIds = ids(releaseCount)

      const [songsRaw, releasesRaw, statsRaw, sponsorsRaw] = await Promise.all([
        Promise.all(ids(songCount).map((id) => client.readContract({ ...base, functionName: 'getSong', args: [BigInt(id)] }))),
        Promise.all(releaseIds.map((id) => client.readContract({ ...base, functionName: 'getRelease', args: [BigInt(id)] }))),
        Promise.all(releaseIds.map((id) => client.readContract({ ...base, functionName: 'passStats', args: [BigInt(id)] }))),
        Promise.all(releaseIds.map((id) => client.readContract({ ...base, functionName: 'getSponsorships', args: [BigInt(id)] }))),
      ])

      const songs: Song[] = songsRaw.map((s, i) => ({
        id: i + 1,
        title: s.title,
        artist: s.artist,
        metadataURI: s.metadataURI,
      }))

      const releases: Release[] = releasesRaw.map((r, i) => ({
        id: i + 1,
        songId: Number(r.songId),
        artist: r.artist,
        creator: r.creator,
        beatmapId: r.beatmapId,
        source: r.source === 0 ? 'auto' : 'manual',
        difficulty: r.difficulty,
        price: r.price,
        active: r.active,
        accessSold: Number(r.accessSold),
      }))

      const passStats: Record<number, PassStats> = {}
      const sponsorships: Record<number, Sponsorship[]> = {}
      releaseIds.forEach((id, i) => {
        const [bought, used, remaining] = statsRaw[i]
        passStats[id] = { bought: Number(bought), used: Number(used), remaining: Number(remaining) }
        sponsorships[id] = sponsorsRaw[i].map((s, index) => ({
          releaseId: id,
          index,
          brand: s.brand,
          brandName: s.brandName,
          logoURI: s.logoURI,
          bought: Number(s.bought),
          used: Number(s.used),
        }))
      })

      return { songs, releases, passStats, sponsorships }
    },
  })

  return {
    catalog: query.data ?? EMPTY,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
