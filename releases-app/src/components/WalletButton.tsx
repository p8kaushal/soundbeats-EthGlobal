import { useState } from 'react'
import { AlertTriangle, LogOut, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { CHAIN_ID } from '../contracts/soundBeats'
import { describeError } from '../lib/errors'
import { fmtUsdc, shortAddress } from '../lib/format'

function hasInjectedProvider(): boolean {
  return typeof window !== 'undefined' && 'ethereum' in window && !!(window as Window & { ethereum?: unknown }).ethereum
}

/** Deep link that opens this page inside the MetaMask mobile app browser (iPhone Safari has no wallet). */
function metaMaskDeepLink(): string {
  const { host, pathname, search } = window.location
  return `https://metamask.app.link/dapp/${host}${pathname}${search}`
}

export function WalletButton({ usdcBalance }: { usdcBalance: bigint }) {
  const { address, isConnected, isReconnecting, chainId } = useAccount()
  const { connectors, connectAsync, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const [menu, setMenu] = useState(false)

  const metaMask = connectors.find((c) => c.id === 'io.metamask' || c.id === 'io.metamask.mobile' || c.name === 'MetaMask')
  const connector = metaMask ?? connectors.find((c) => c.id !== 'injected') ?? connectors[0]
  const providerAvailable = hasInjectedProvider() || connectors.some((c) => c.id !== 'injected')

  const connect = async () => {
    if (!connector) return
    try {
      await connectAsync({ connector, chainId: CHAIN_ID })
    } catch (error) {
      const message = describeError(error)
      if (message) toast.error(message)
    }
  }

  const switchNetwork = async () => {
    try {
      await switchChainAsync({ chainId: CHAIN_ID })
    } catch (error) {
      const message = describeError(error)
      if (message) toast.error(message)
    }
  }

  if (isReconnecting) {
    return <div className="h-11 w-32 animate-pulse rounded-full" style={{ background: 'var(--surface-muted)' }} />
  }

  if (!isConnected || !address) {
    if (!providerAvailable) {
      return (
        <a href={metaMaskDeepLink()} className="btn-primary text-sm">
          <Wallet size={18} /> Open in MetaMask
        </a>
      )
    }
    return (
      <button type="button" onClick={() => void connect()} disabled={isPending} className="btn-primary text-sm">
        <Wallet size={18} /> {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
    )
  }

  if (chainId !== CHAIN_ID) {
    return (
      <button type="button" onClick={() => void switchNetwork()} disabled={switching} className="btn-primary text-sm" style={{ background: 'var(--danger)' }}>
        <AlertTriangle size={18} /> {switching ? 'Switching…' : 'Switch to Arc Testnet'}
      </button>
    )
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setMenu((v) => !v)} className="btn-ghost text-sm" aria-expanded={menu} aria-haspopup="menu">
        <span className="tabular-nums">{fmtUsdc(usdcBalance)} USDC</span>
        <span className="mono text-xs" style={{ color: 'var(--muted)' }}>{shortAddress(address)}</span>
      </button>
      {menu && (
        <div role="menu" className="glass absolute right-0 z-30 mt-2 w-48 rounded-2xl p-1.5" style={{ background: 'var(--surface-strong)' }}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              disconnect()
              setMenu(false)
            }}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold"
          >
            <LogOut size={16} /> Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
