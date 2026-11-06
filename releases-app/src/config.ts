/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { requireChain } from './onchain-facts'

const ARC_RPC = requireChain(arcTestnet.id).rpcUrls[0]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, ARC_RPC)

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  // Injected covers MetaMask (extension and the MetaMask mobile in-app browser) via EIP-6963.
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(ARC_RPC, { batch: true }),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
