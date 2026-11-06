import { useState } from 'react'
import { useTx } from '../hooks/useTx'
import { fmtUsdc, sameAddress, splitPreview } from '../lib/format'
import { ConnectPrompt } from './ConnectPrompt'
import { BrandLogo, Card, Empty, SectionTitle, Stat, TxStatus } from './ui'
import { releaseTitle, type AppData } from './appData'

export function BrandPage({ data }: { data: AppData }) {
  const { state, run, reset, busy } = useTx()
  const [releaseId, setReleaseId] = useState('')
  const [quantity, setQuantity] = useState('10')
  const [brandName, setBrandName] = useState('')
  const [logoURI, setLogoURI] = useState('')

  if (!data.address) return <ConnectPrompt message="Connect your brand wallet to sponsor free passes and see how many get used." />
  const address = data.address

  const sellable = data.catalog.releases.filter((r) => r.active)
  const selectedId = releaseId || String(sellable[0]?.id ?? '')
  const release = sellable.find((r) => String(r.id) === selectedId)
  const qty = /^\d+$/.test(quantity) ? Number(quantity) : 0
  const qtyValid = qty >= 1 && qty <= 10_000
  const total = release && qtyValid ? release.price * BigInt(qty) : null
  const split = total ? splitPreview(total) : null
  const valid = !!release && qtyValid && brandName.trim().length > 0 && brandName.trim().length <= 64 && logoURI.length <= 512

  const mine = Object.values(data.catalog.sponsorships).flat().filter((s) => sameAddress(s.brand, address))
  const bought = mine.reduce((n, s) => n + s.bought, 0)
  const used = mine.reduce((n, s) => n + s.used, 0)

  const submit = async () => {
    if (!release || total === null) return
    const ok = await run({
      call: { functionName: 'sponsorPasses', args: [BigInt(release.id), BigInt(qty), brandName.trim(), logoURI.trim()] },
      spend: total,
      successMessage: `Sponsored ${qty} ${qty === 1 ? 'pass' : 'passes'}`,
    })
    if (ok) setQuantity('10')
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Bought" value={String(bought)} />
          <Stat label="Used" value={String(used)} />
          <Stat label="Remaining" value={String(bought - used)} />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Sponsor free passes" hint="You prepay, players claim one free pass each, and artist and creator are paid right away." />
        {sellable.length === 0 ? (
          <Empty title="No releases on sale" />
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-semibold">
              Release
              <select className="field mt-1" value={selectedId} onChange={(e) => setReleaseId(e.target.value)}>
                {sellable.map((r) => (
                  <option key={r.id} value={r.id}>{releaseTitle(r, data.songById)} · {fmtUsdc(r.price)} USDC</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Number of passes
              <input className="field mt-1 tabular-nums" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="block text-sm font-semibold">
              Brand name
              <input className="field mt-1" value={brandName} maxLength={64} onChange={(e) => setBrandName(e.target.value)} placeholder="Shown to players" />
            </label>
            <label className="block text-sm font-semibold">
              Logo link (optional)
              <input className="field mt-1" value={logoURI} maxLength={512} onChange={(e) => setLogoURI(e.target.value)} placeholder="https://…/logo.png" inputMode="url" />
            </label>
            {total !== null && split && (
              <div className="rounded-2xl px-3 py-3 text-sm tabular-nums" style={{ background: 'var(--surface-muted)' }}>
                <p className="display text-xl font-semibold">{fmtUsdc(total)} USDC</p>
                <p style={{ color: 'var(--muted)' }}>
                  {fmtUsdc(split.artist)} to the artist · {fmtUsdc(split.creator)} to the creator
                </p>
              </div>
            )}
            <button type="button" onClick={() => void submit()} disabled={!valid || busy} className="btn-primary w-full">
              {busy ? 'Working…' : total ? `Sponsor for ${fmtUsdc(total)} USDC` : 'Sponsor passes'}
            </button>
            <TxStatus state={state} onReset={reset} />
          </div>
        )}
      </Card>

      <section className="space-y-3">
        <SectionTitle title="My sponsorships" />
        {mine.length === 0 ? (
          <Empty title="No sponsorships yet" body="Passes you sponsor appear here with live used and remaining counts." />
        ) : (
          mine.map((s) => {
            const pct = s.bought === 0 ? 0 : Math.round((s.used / s.bought) * 100)
            const rel = data.catalog.releases.find((r) => r.id === s.releaseId)
            return (
              <Card key={`${s.releaseId}-${s.index}`} className="space-y-3">
                <div className="flex items-center gap-3">
                  <BrandLogo name={s.brandName} logoURI={s.logoURI} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="display truncate font-semibold">{s.brandName}</p>
                    <p className="truncate text-sm" style={{ color: 'var(--muted)' }}>{rel ? releaseTitle(rel, data.songById) : `Release #${s.releaseId}`}</p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                </div>
                <p className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                  {s.used} used · {s.bought - s.used} remaining · {s.bought} bought
                </p>
              </Card>
            )
          })
        )}
      </section>
    </div>
  )
}
