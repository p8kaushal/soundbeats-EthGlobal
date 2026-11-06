import { useState } from 'react'
import { useTx } from '../hooks/useTx'
import { fmtUsdc, sameAddress, splitPreview, tryParseUsdc } from '../lib/format'
import { ConnectPrompt } from './ConnectPrompt'
import { Card, DifficultyMeter, Empty, SectionTitle, SourceBadge, Stat, TxStatus } from './ui'
import { artistLabel, releaseTitle, type AppData } from './appData'

export function CreatorPage({ data }: { data: AppData }) {
  const publish = useTx()
  const toggle = useTx()
  const [songId, setSongId] = useState('')
  const [beatmapId, setBeatmapId] = useState('')
  const [source, setSource] = useState<'auto' | 'manual'>('manual')
  const [difficulty, setDifficulty] = useState(5)
  const [price, setPrice] = useState('1.00')

  if (!data.address) return <ConnectPrompt message="Connect your creator wallet to publish beatmap releases and track earnings." />
  const address = data.address

  const selected = songId || String(data.catalog.songs[0]?.id ?? '')
  const raw = tryParseUsdc(price)
  const valid = !!selected && beatmapId.trim().length > 0 && beatmapId.trim().length <= 64 && raw !== null
  const preview = raw ? splitPreview(raw) : null
  const mine = data.catalog.releases.filter((r) => sameAddress(r.creator, address))

  const submit = async () => {
    if (raw === null) return
    const ok = await publish.run({
      call: {
        functionName: 'publishRelease',
        args: [BigInt(selected), beatmapId.trim(), source === 'auto' ? 0 : 1, difficulty, raw, address],
      },
      successMessage: 'Release published',
    })
    if (ok) setBeatmapId('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <Stat label="Earned as creator" value={`${fmtUsdc(data.me.creatorEarned)} USDC`} sub="30% of every sale and sponsored pass on your releases." />
      </Card>

      <Card>
        <SectionTitle title="Publish a release" hint="Pick a registered song and attach your beatmap." />
        {data.catalog.songs.length === 0 ? (
          <Empty title="No songs to publish for" body="An artist has to register a song first." />
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-semibold">
              Song
              <select className="field mt-1" value={selected} onChange={(e) => setSongId(e.target.value)}>
                {data.catalog.songs.map((s) => (
                  <option key={s.id} value={s.id}>{s.title} · {artistLabel(s)}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Beatmap ID
              <input className="field mono mt-1" value={beatmapId} maxLength={64} onChange={(e) => setBeatmapId(e.target.value)} placeholder="the ID from your game" />
            </label>
            <fieldset>
              <legend className="text-sm font-semibold">Beatmap source</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['manual', 'auto'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={source === s}
                    onClick={() => setSource(s)}
                    className="min-h-[48px] rounded-2xl border font-semibold"
                    style={source === s ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : { background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
                  >
                    {s === 'manual' ? 'Hand-made' : 'Auto map'}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-semibold">
              <span className="flex items-center justify-between">Difficulty <DifficultyMeter value={difficulty} /></span>
              <input type="range" min={1} max={10} step={1} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="mt-2 h-11 w-full" style={{ accentColor: 'var(--accent)' }} />
            </label>
            <label className="block text-sm font-semibold">
              Price (USDC)
              <input className="field mt-1 tabular-nums" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1.00" />
            </label>
            {preview && (
              <p className="rounded-2xl px-3 py-2 text-sm tabular-nums" style={{ background: 'var(--surface-muted)' }}>
                Per sale you earn <strong>{fmtUsdc(preview.creator)}</strong> and the artist earns <strong>{fmtUsdc(preview.artist)}</strong> USDC.
              </p>
            )}
            <button type="button" onClick={() => void submit()} disabled={!valid || publish.busy} className="btn-primary w-full">
              {publish.busy ? 'Working…' : 'Publish release'}
            </button>
            <TxStatus state={publish.state} onReset={publish.reset} />
          </div>
        )}
      </Card>

      <section className="space-y-3">
        <SectionTitle title="My releases" />
        {mine.length === 0 ? (
          <Empty title="No releases yet" body="Publish your first beatmap above." />
        ) : (
          mine.map((r) => (
            <Card key={r.id} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="display truncate font-semibold">{releaseTitle(r, data.songById)}</p>
                  <p className="mono truncate text-xs" style={{ color: 'var(--subtle)' }}>{r.beatmapId}</p>
                </div>
                <p className="display text-lg font-semibold tabular-nums">{fmtUsdc(r.price)}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3"><DifficultyMeter value={r.difficulty} /><SourceBadge source={r.source} /></div>
                <p className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>{r.accessSold} sold</p>
              </div>
              <button
                type="button"
                disabled={toggle.busy}
                onClick={() => void toggle.run({ call: { functionName: 'setReleaseActive', args: [BigInt(r.id), !r.active] }, successMessage: r.active ? 'Release paused' : 'Release on sale' })}
                className="btn-ghost w-full"
              >
                {r.active ? 'Pause sales' : 'Resume sales'}
              </button>
            </Card>
          ))
        )}
        <TxStatus state={toggle.state} onReset={toggle.reset} />
      </section>
    </div>
  )
}
