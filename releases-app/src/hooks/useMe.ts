import { useQuery } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { CHAIN_ID, SOUNDBEATS_ADDRESS, USDC_ADDRESS, soundBeatsAbi } from '../contracts/soundBeats'

export interface MyState {
  /** Releases the wallet can play (bought or claimed with a sponsored pass). */
  access: Set<number>
  /** Release id -> index of the sponsorship that paid for this wallet's free pass. */
  passFrom: Map<number, number>
  artistEarned: bigint
  creatorEarned: bigint
  usdcBalance: bigint
}

const EMPTY: MyState = {
  access: new Set(),
  passFrom: new Map(),
  artistEarned: 0n,
  creatorEarned: 0n,
  usdcBalance: 0n,
}

/** Everything the connected wallet owns or has earned, read live from the contract. */
export function useMe(releaseIds: number[]) {
  const { address } = useAccount()
  const client = usePublicClient({ chainId: CHAIN_ID })

  const query = useQuery({
    queryKey: ['me', address, releaseIds.join(',')],
    enabled: !!address && !!client,
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MyState> => {
      if (!address || !client) return EMPTY
      const base = { address: SOUNDBEATS_ADDRESS, abi: soundBeatsAbi } as const

      const [artistEarned, creatorEarned, usdcBalance, accessFlags, passFlags] = await Promise.all([
        client.readContract({ ...base, functionName: 'totalEarnedByArtist', args: [address] }),
        client.readContract({ ...base, functionName: 'totalEarnedByCreator', args: [address] }),
        client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        Promise.all(releaseIds.map((id) => client.readContract({ ...base, functionName: 'hasAccess', args: [BigInt(id), address] }))),
        Promise.all(releaseIds.map((id) => client.readContract({ ...base, functionName: 'passSponsorship', args: [BigInt(id), address] }))),
      ])

      const access = new Set<number>()
      const passFrom = new Map<number, number>()
      releaseIds.forEach((id, i) => {
        if (accessFlags[i]) access.add(id)
        // Stored as sponsorshipId + 1, so zero means "no pass claimed".
        if (passFlags[i] > 0n) passFrom.set(id, Number(passFlags[i]) - 1)
      })

      return { access, passFrom, artistEarned, creatorEarned, usdcBalance }
    },
  })

  return { me: query.data ?? EMPTY, address, isLoading: query.isLoading }
}
