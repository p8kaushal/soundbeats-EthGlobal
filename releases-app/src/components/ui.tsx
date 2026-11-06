import type { ReactNode } from 'react'
import { AlertCircle, Check, ExternalLink, Loader2 } from 'lucide-react'
import { CHAIN_ID } from '../contracts/soundBeats'
import { buildTxExplorerUrl } from '../onchain-facts'
import type { TxState } from '../hooks/useTx'
import { safeImageUrl } from '../lib/metadata'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-3xl p-4 sm:p-5 ${className}`}>{children}</section>
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 px-1">
      <h2 className="display text-xl font-semibold text-balance">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-pretty" style={{ color: 'var(--muted)' }}>{hint}</p>}
    </div>
  )
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-8 text-center" style={{ borderColor: 'var(--border)' }}>
      <p className="font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-xs text-sm text-pretty" style={{ color: 'var(--muted)' }}>{body}</p>}
    </div>
  )
}

/** Cover art generated from the song id. No stock images, no fake covers. */
export function SongArt({ id, title, size = 56, cover }: { id: number; title: string; size?: number; cover?: string }) {
  const img = cover ? safeImageUrl(cover) : null
  if (img) return <img src={img} alt="" aria-hidden loading="lazy" className="shrink-0 rounded-2xl object-cover" style={{ width: size, height: size }} />
  const hue = (id * 67 + 200) % 360
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <div
      aria-hidden
      className="display flex shrink-0 items-center justify-center rounded-2xl text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        fontWeight: 700,
        background: `linear-gradient(135deg, hsl(${hue} 42% 32%), hsl(${(hue + 40) % 360} 48% 52%))`,
      }}
    >
      {initials}
    </div>
  )
}

export function DifficultyMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Difficulty ${value} of 10`}>
      <div className="flex items-end gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className="w-[5px] rounded-full"
            style={{
              height: 6 + i * 1.6,
              background: i < value ? 'var(--accent)' : 'rgba(18,45,69,0.14)',
            }}
          />
        ))}
      </div>
      <span className="text-sm font-semibold tabular-nums">{value}/10</span>
    </div>
  )
}

export function SourceBadge({ source }: { source: 'auto' | 'manual' }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase"
      style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', letterSpacing: '0.08em' }}
    >
      {source === 'auto' ? 'Auto map' : 'Hand-made'}
    </span>
  )
}

export function BrandLogo({ name, logoURI, size = 28 }: { name: string; logoURI: string; size?: number }) {
  const src = safeImageUrl(logoURI)
  if (src) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size, background: 'var(--surface-muted)' }}
      />
    )
  }
  return (
    <div
      aria-hidden
      className="display flex shrink-0 items-center justify-center rounded-lg text-xs font-bold"
      style={{ width: size, height: size, background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase" style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>{label}</p>
      <p className="display mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>{sub}</p>}
    </div>
  )
}

const PHASE_COPY: Record<string, string> = {
  switching: 'Switching your wallet to Arc Testnet…',
  allowing: 'Allow USDC in your wallet to continue…',
  'allow-confirming': 'Confirming your USDC allowance…',
  signing: 'Confirm the payment in your wallet…',
  confirming: 'Waiting for onchain confirmation…',
}

/** Real transaction state only: every line maps to a wallet prompt or an onchain receipt. */
export function TxStatus({ state, onReset }: { state: TxState; onReset?: () => void }) {
  if (state.phase === 'idle') return null
  const explorer = state.hash ? buildTxExplorerUrl(CHAIN_ID, state.hash) : null

  if (state.phase === 'error') {
    return (
      <div role="alert" className="mt-3 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
        <AlertCircle size={18} className="mt-0.5 shrink-0" />
        <span className="flex-1 text-pretty">{state.error}</span>
        {onReset && (
          <button type="button" onClick={onReset} className="min-h-[44px] px-2 font-semibold underline">
            Dismiss
          </button>
        )}
      </div>
    )
  }

  if (state.phase === 'success') {
    return (
      <div role="status" className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm" style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }}>
        <Check size={18} className="shrink-0" />
        <span className="flex-1 font-semibold">Confirmed onchain</span>
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 px-2 font-semibold underline">
            Explorer <ExternalLink size={14} />
          </a>
        )}
        {onReset && (
          <button type="button" onClick={onReset} className="min-h-[44px] px-2 font-semibold underline">
            Close
          </button>
        )}
      </div>
    )
  }

  return (
    <div role="status" className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
      <Loader2 size={18} className="shrink-0 animate-spin" />
      <span className="flex-1">{PHASE_COPY[state.phase]}</span>
      {explorer && (
        <a href={explorer} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 px-2 font-semibold underline">
          Explorer <ExternalLink size={14} />
        </a>
      )}
    </div>
  )
}
