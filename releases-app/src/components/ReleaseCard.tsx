import { Check, Gift, Lock } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { useAccount } from 'wagmi'
import type { Release } from '../contracts/soundBeats'
import { useTx } from '../hooks/useTx'
import { fmtUsdc, splitPreview } from '../lib/format'
import { decodeSongMeta } from '../lib/metadata'
import { artistLabel, type AppData } from './appData'
import { BrandLogo, DifficultyMeter, SongArt, SourceBadge, TxStatus } from './ui'
import { WalletButton } from './WalletButton'

export function ReleaseCard({ release, data }: { release: Release; data: AppData }) {
  const { isConnected } = useAccount()
  const { state, run, reset, busy } = useTx()

  const song = data.songById.get(release.songId)
  const meta = decodeSongMeta(song?.metadataURI ?? '')
  const owned = data.me.access.has(release.id)
  const stats = data.catalog.passStats[release.id]
  const sponsorships = data.catalog.sponsorships[release.id] ?? []

  const myPassIndex = data.me.passFrom.get(release.id)
  const myPassBrand = myPassIndex !== undefined ? sponsorships[myPassIndex] : undefined
  // Passes are drawn oldest first, so the first batch with passes left is the one that pays for the next claim.
  const nextSponsor = sponsorships.find((s) => s.used < s.bought)
  const passesLeft = stats?.remaining ?? 0

  const split = splitPreview(release.price)
  const title = song?.title ?? `Song #${release.songId}`

  const buy = () =>
    run({
      call: { functionName: 'buyAccess', args: [BigInt(release.id)] },
      spend: release.price,
      successMessage: `Unlocked ${title}`,
    })

  const claim = () =>
    run({
      call: { functionName: 'claimPass', args: [BigInt(release.id)] },
      successMessage: `Free pass claimed for ${title}`,
    })

  return (
    <article className="glass rounded-3xl p-4 sm:p-5">
      <div className="flex gap-3">
        <SongArt id={release.songId} title={title} size={64} cover={meta.cover} />
        <div className="min-w-0 flex-1">
          <h3 className="display truncate text-lg font-semibold">{title}</h3>
          <p className="truncate text-sm" style={{ color: 'var(--muted)' }}>
            {artistLabel(song, release.artist)}
            {meta.album ? ` · ${meta.album}` : meta.genre ? ` · ${meta.genre}` : ''}
            {meta.bpm ? ` · ${meta.bpm} BPM` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <DifficultyMeter value={release.difficulty} />
            <SourceBadge source={release.source} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums display">
            <TokenUSDC variant="branded" size={20} /> {fmtUsdc(release.price)}
          </p>
          <p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
            {fmtUsdc(split.artist)} artist · {fmtUsdc(split.creator)} creator
          </p>
        </div>
        <p className="mono text-right text-xs" style={{ color: 'var(--subtle)' }}>
          {release.beatmapId}
          <br />
          {release.accessSold} sold
        </p>
      </div>

      {passesLeft > 0 && nextSponsor && !owned && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm" style={{ background: 'var(--surface-muted)' }}>
          <BrandLogo name={nextSponsor.brandName} logoURI={nextSponsor.logoURI} size={24} />
          <span className="flex-1 text-pretty">
            <strong>{passesLeft}</strong> free {passesLeft === 1 ? 'pass' : 'passes'} sponsored by <strong>{nextSponsor.brandName}</strong>
          </span>
        </div>
      )}

      <div className="mt-4">
        {owned ? (
          <div className="flex min-h-[48px] items-center gap-2 rounded-full px-4 font-semibold" style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }}>
            <Check size={18} />
            {myPassBrand ? (
              <span className="flex items-center gap-2">
                Unlocked with a free pass from {myPassBrand.brandName}
              </span>
            ) : (
              'Unlocked. Ready to play.'
            )}
          </div>
        ) : !isConnected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect a wallet to buy.</p>
            <WalletButton usdcBalance={0n} />
          </div>
        ) : !release.active && passesLeft === 0 ? (
          <div className="flex min-h-[48px] items-center gap-2 rounded-full px-4 text-sm font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            <Lock size={16} /> Not on sale
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            {release.active && (
              <button type="button" onClick={() => void buy()} disabled={busy} className="btn-primary flex-1">
                {busy ? 'Working…' : `Buy access · ${fmtUsdc(release.price)} USDC`}
              </button>
            )}
            {passesLeft > 0 && (
              <button type="button" onClick={() => void claim()} disabled={busy} className="btn-ghost flex-1">
                <Gift size={16} /> Claim free pass
              </button>
            )}
          </div>
        )}
        <TxStatus state={state} onReset={reset} />
      </div>
    </article>
  )
}
