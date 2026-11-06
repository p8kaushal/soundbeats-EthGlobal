import { getAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '../onchain-facts'
import { soundBeatsAbi } from './soundBeatsAbi'

export { soundBeatsAbi }

/** Arc Testnet, the only chain SoundBeats Releases is deployed on. */
export const CHAIN_ID = arcTestnet.id

/** SoundBeatsReleases deployment on Arc Testnet. */
export const SOUNDBEATS_ADDRESS = getAddress('0x71a39b29e81497af2d8c3ab315ce3d778e999471')

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is missing from the onchain facts for Arc Testnet')

/** Official Arc Testnet USDC (ERC-20 view, 6 decimals). */
export const USDC_ADDRESS = getAddress(usdcFact.address)

export const soundBeats = {
  address: SOUNDBEATS_ADDRESS,
  abi: soundBeatsAbi,
  chainId: CHAIN_ID,
} as const

export type BeatmapSource = 'auto' | 'manual'

export interface Song {
  id: number
  title: string
  artist: `0x${string}`
  metadataURI: string
}

export interface Release {
  id: number
  songId: number
  artist: `0x${string}`
  creator: `0x${string}`
  beatmapId: string
  source: BeatmapSource
  difficulty: number
  price: bigint
  active: boolean
  accessSold: number
}

export interface Sponsorship {
  releaseId: number
  index: number
  brand: `0x${string}`
  brandName: string
  logoURI: string
  bought: number
  used: number
}

export interface PassStats {
  bought: number
  used: number
  remaining: number
}
