import { useState } from 'react'
import { useTx } from '../hooks/useTx'
import { fmtUsdc, sameAddress } from '../lib/format'
import { decodeSongMeta, encodeSongMeta } from '../lib/metadata'
import { ConnectPrompt } from './ConnectPrompt'
import { Card, Empty, SectionTitle, SongArt, Stat, TxStatus } from './ui'
import type { AppData } from './appData'

export function ArtistPage({ data }: { data: AppData }) {
  const { state, run, reset, busy } = useTx()
  const [title, setTitle] = useState('')
  const [artistName, setArtistName] = useState('')
  const [genre, setGenre] = useState('')

  if (!data.address) return <ConnectPrompt message="Connect the wallet you want to be paid with to manage your songs." />
  const address = data.address

  const mySongs = data.catalog.songs.filter((s) => sameAddress(s.artist, address))
  const valid = title.trim().length > 0 && title.trim().length <= 100

  const submit = async () => {
    const ok = await run({
      call: {
        functionName: 'registerSong',
        args: [
          title.trim(),
          address,
          encodeSongMeta({ artistName: artistName.trim() || undefined, genre: genre.trim() || undefined }),
        ],
      },
      successMessage: `Registered ${title.trim()}`,
    })
    if (ok) {
      setTitle('')
      setArtistName('')
      setGenre('')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <Stat label="Earned as artist" value={`${fmtUsdc(data.me.artistEarned)} USDC`} sub="70% of every sale and sponsored pass, paid instantly to your wallet." />
      </Card>

      <section className="space-y-3">
        <SectionTitle title="My songs" />
        {mySongs.length === 0 ? (
          <Empty title="No songs yet" body="Register a song below so beatmap creators can publish releases for it." />
        ) : (
          mySongs.map((song) => {
            const releases = data.catalog.releases.filter((r) => r.songId === song.id)
            const sold = releases.reduce((sum, r) => sum + r.accessSold, 0)
            const meta = decodeSongMeta(song.metadataURI)
            return (
              <Card key={song.id} className="flex items-center gap-3">
                <SongArt id={song.id} title={song.title} cover={meta.cover} />
                <div className="min-w-0 flex-1">
                  <p className="display truncate font-semibold">{song.title}</p>
                  <p className="truncate text-sm" style={{ color: 'var(--muted)' }}>{meta.genre ?? 'Song'} · song #{song.id}</p>
                </div>
                <p className="text-right text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                  {releases.length} {releases.length === 1 ? 'release' : 'releases'}
                  <br />
                  {sold} sold
                </p>
              </Card>
            )
          })
        )}
      </section>

      <Card>
        <SectionTitle title="Register a song" hint="Payments for this song go to your connected wallet." />
        <div className="space-y-3">
          <label className="block text-sm font-semibold">
            Song title
            <input className="field mt-1" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Neon Skyline" />
          </label>
          <label className="block text-sm font-semibold">
            Artist name (optional)
            <input className="field mt-1" value={artistName} maxLength={60} onChange={(e) => setArtistName(e.target.value)} placeholder="Shown in the catalog" />
          </label>
          <label className="block text-sm font-semibold">
            Genre (optional)
            <input className="field mt-1" value={genre} maxLength={40} onChange={(e) => setGenre(e.target.value)} placeholder="Synthwave" />
          </label>
          <button type="button" onClick={() => void submit()} disabled={!valid || busy} className="btn-primary w-full">
            {busy ? 'Working…' : 'Register song'}
          </button>
          <TxStatus state={state} onReset={reset} />
        </div>
      </Card>
    </div>
  )
}
