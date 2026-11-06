import { useEffect, useRef, useState } from 'react'
import { useTx } from '../hooks/useTx'
import { fmtUsdc, sameAddress } from '../lib/format'
import { MAX_METADATA_BYTES, MEDIA_ORIGIN, decodeSongMeta, encodeSongMeta, metadataBytes } from '../lib/metadata'
import { checkFile, createDraft, finalizeWithRetry, getUpload, uploadFile, type UploadRecord } from '../lib/uploads'
import { ConnectPrompt } from './ConnectPrompt'
import { Card, Empty, SectionTitle, SongArt, Stat, TxStatus } from './ui'
import type { AppData } from './appData'

type Step = 'idle' | 'audio' | 'artwork' | 'register' | 'saving' | 'done' | 'error'

const STEP_LABEL: Record<Step, string> = {
  idle: '',
  audio: 'Uploading your song…',
  artwork: 'Uploading the cover…',
  register: 'Confirm in your wallet to register the song on Arc…',
  saving: 'Saving the catalog record to Arkiv…',
  done: '',
  error: '',
}

export function ArtistPage({ data }: { data: AppData }) {
  const { state, run, reset, busy: txBusy } = useTx()
  const [title, setTitle] = useState('')
  const [artistName, setArtistName] = useState('')
  const [genre, setGenre] = useState('')
  const [audio, setAudio] = useState<File | null>(null)
  const [artwork, setArtwork] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [audioPreview, setAudioPreview] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadRecord | null>(null)
  // The draft survives a failed or cancelled wallet step, so a retry does not re-upload.
  const draft = useRef<{ record: UploadRecord; key: string } | null>(null)
  const pendingHash = useRef<string | null>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const artInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!artwork) { setPreview(null); return }
    const url = URL.createObjectURL(artwork)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [artwork])

  useEffect(() => {
    if (!audio) { setAudioPreview(null); return }
    const url = URL.createObjectURL(audio)
    setAudioPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [audio])

  if (!data.address) return <ConnectPrompt message="Connect the wallet you want to be paid with to manage your songs." />
  const address = data.address

  const mySongs = data.catalog.songs.filter((s) => sameAddress(s.artist, address)).sort((a, b) => b.id - a.id)
  const fileError = checkFile(audio, 'audio') ?? checkFile(artwork, 'artwork')
  const valid = title.trim().length > 0 && title.trim().length <= 100 && !fileError
  const working = step === 'audio' || step === 'artwork' || step === 'register' || step === 'saving' || txBusy

  const fail = (message: string) => { setError(message); setStep('error') }

  const finish = async (id: string, hash: string) => {
    setStep('saving')
    try {
      const record = await finalizeWithRetry(id, hash)
      setResult(record)
      setStep('done')
      draft.current = null
      pendingHash.current = null
      setTitle(''); setArtistName(''); setGenre(''); setAudio(null); setArtwork(null)
      if (audioInput.current) audioInput.current.value = ''
      if (artInput.current) artInput.current.value = ''
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the song to Arkiv.')
    }
  }

  const submit = async () => {
    if (!audio || !artwork) return
    setError(null); setResult(null)
    // A new draft is needed if the form changed since the last attempt.
    const key = [title.trim(), artistName.trim(), genre.trim(), audio.name, audio.size, artwork.name, artwork.size, address].join('|')
    try {
      if (pendingHash.current && draft.current?.key === key) return await finish(draft.current.record.id, pendingHash.current)
      if (!draft.current || draft.current.key !== key) {
        const record = await createDraft({ title: title.trim(), artistName: artistName.trim(), genre: genre.trim(), wallet: address })
        draft.current = { record, key }
      }
      let record = draft.current.record
      if (!record.audio) { setStep('audio'); record = await uploadFile(record.id, 'audio', audio) }
      if (!record.artwork) { setStep('artwork'); record = await uploadFile(record.id, 'artwork', artwork) }
      draft.current = { record, key }
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Upload failed.')
    }

    const id = draft.current.record.id
    const metadataURI = encodeSongMeta({
      uploadId: id,
      artistName: artistName.trim() || undefined,
      genre: genre.trim() || undefined,
      cover: `${MEDIA_ORIGIN}/api/media/${id}/artwork`,
    })
    if (metadataBytes(metadataURI) > MAX_METADATA_BYTES) return fail('The artist name or genre is too long. Shorten it and try again.')

    setStep('register')
    const hash = await run({
      call: { functionName: 'registerSong', args: [title.trim(), address, metadataURI] },
      successMessage: `Registered ${title.trim()} on Arc`,
    })
    if (hash) return finish(id, hash)
    setStep('idle')
  }

  // If the wallet step ended uncertain, the song may still be onchain: let the artist finish saving.
  const uncertainHash = state.phase === 'uncertain' || state.phase === 'error' ? state.hash : undefined
  const resumeUncertain = async () => {
    if (!uncertainHash || !draft.current) return
    pendingHash.current = uncertainHash
    reset()
    await finish(draft.current.record.id, uncertainHash)
  }

  return (
    <div className="space-y-6">
      <Card>
        <Stat label="Earned as artist" value={`${fmtUsdc(data.me.artistEarned)} USDC`} sub="70% of every sale and sponsored pass, paid instantly to your wallet." />
      </Card>

      <Card>
        <SectionTitle title="Upload a song" hint="Your MP3 and cover are stored privately. The song is registered on Arc from your wallet, so payments go straight to you." />
        <div className="space-y-3">
          <label className="block text-sm font-semibold">
            Song file (MP3, up to 25 MB)
            <input ref={audioInput} type="file" accept="audio/mpeg,.mp3" className="field mt-1 py-2.5" disabled={working}
              onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
          </label>
          {audioPreview && !checkFile(audio, 'audio') && (
            <audio controls preload="metadata" className="w-full" src={audioPreview} />
          )}
          <label className="block text-sm font-semibold">
            Cover image (JPG, PNG or WebP, up to 5 MB)
            <input ref={artInput} type="file" accept="image/jpeg,image/png,image/webp" className="field mt-1 py-2.5" disabled={working}
              onChange={(e) => setArtwork(e.target.files?.[0] ?? null)} />
          </label>
          {preview && <img src={preview} alt="Cover preview" className="h-28 w-28 rounded-2xl object-cover" />}
          <label className="block text-sm font-semibold">
            Song title
            <input className="field mt-1" value={title} maxLength={100} disabled={working} onChange={(e) => setTitle(e.target.value)} placeholder="Neon Skyline" />
          </label>
          <label className="block text-sm font-semibold">
            Artist name (optional)
            <input className="field mt-1" value={artistName} maxLength={60} disabled={working} onChange={(e) => setArtistName(e.target.value)} placeholder="Shown in the catalog" />
          </label>
          <label className="block text-sm font-semibold">
            Genre (optional)
            <input className="field mt-1" value={genre} maxLength={40} disabled={working} onChange={(e) => setGenre(e.target.value)} placeholder="Synthwave" />
          </label>
          {(audio || artwork) && fileError && <p className="text-sm" style={{ color: 'var(--danger)' }}>{fileError}</p>}
          <button type="button" onClick={() => void submit()} disabled={!valid || working} className="btn-primary w-full">
            {working ? 'Working…' : step === 'error' ? 'Try again' : 'Upload and register'}
          </button>

          {working && STEP_LABEL[step] && <p className="text-sm" style={{ color: 'var(--muted)' }} aria-live="polite">{STEP_LABEL[step]}</p>}
          {step === 'register' && <TxStatus state={state} onReset={reset} />}
          {step !== 'register' && state.phase !== 'idle' && state.phase !== 'success' && <TxStatus state={state} onReset={reset} />}
          {uncertainHash && draft.current && !working && (
            <button type="button" className="btn-ghost w-full border" onClick={() => void resumeUncertain()}>
              My wallet sent it — finish saving
            </button>
          )}
          {step === 'error' && error && <p className="text-sm" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
          {step === 'done' && result && <UploadDone record={result} />}
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle title="My songs" />
        {mySongs.length === 0 ? (
          <Empty title="No songs yet" body="Upload a song above so beatmap creators can publish releases for it." />
        ) : (
          mySongs.map((song) => {
            const releases = data.catalog.releases.filter((r) => r.songId === song.id)
            const sold = releases.reduce((sum, r) => sum + r.accessSold, 0)
            const meta = decodeSongMeta(song.metadataURI)
            return (
              <Card key={song.id} className="space-y-3">
                <div className="flex items-center gap-3">
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
                </div>
                {meta.audio && <audio controls preload="none" className="w-full" src={meta.audio} />}
                {meta.uploadId && <ArkivLink uploadId={meta.uploadId} />}
              </Card>
            )
          })
        )}
      </section>
    </div>
  )
}

function UploadDone({ record }: { record: UploadRecord }) {
  return (
    <div className="space-y-1 rounded-2xl p-3 text-sm" style={{ background: 'rgba(26,128,71,0.08)' }} role="status">
      <p className="font-semibold">Song #{record.arc?.songId} is live on Arc.</p>
      <p>Files stored privately on AWS S3.</p>
      {record.arkiv ? (
        <p>Catalog record saved on Arkiv{record.arkiv.url ? <> · <a className="underline" href={record.arkiv.url} target="_blank" rel="noreferrer">view</a></> : null}.</p>
      ) : (
        <p>{record.arkivError ?? 'Arkiv record pending.'}</p>
      )}
      <p style={{ color: 'var(--muted)' }}>Next: a beatmap creator publishes a release for it in the Creator tab.</p>
    </div>
  )
}

function ArkivLink({ uploadId }: { uploadId: string }) {
  const [record, setRecord] = useState<UploadRecord | null>(null)
  useEffect(() => {
    let live = true
    getUpload(uploadId).then((r) => { if (live) setRecord(r) }).catch(() => undefined)
    return () => { live = false }
  }, [uploadId])
  if (!record) return null
  return (
    <p className="text-xs" style={{ color: 'var(--muted)' }}>
      Stored on AWS S3 · {record.arkiv ? (
        record.arkiv.url
          ? <a className="underline" href={record.arkiv.url} target="_blank" rel="noreferrer">Arkiv record</a>
          : 'Arkiv record saved'
      ) : 'Arkiv record pending'}
    </p>
  )
}
