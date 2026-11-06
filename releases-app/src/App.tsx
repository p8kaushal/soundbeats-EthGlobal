import { useMemo, useState } from 'react'
import { AudioLines, Disc3, KeyRound, Megaphone, Mic2, Music2, type LucideIcon } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ArtistPage } from './components/ArtistPage'
import { BrandPage } from './components/BrandPage'
import { CatalogPage } from './components/CatalogPage'
import { CreatorPage } from './components/CreatorPage'
import { PlayerPage } from './components/PlayerPage'
import { WalletButton } from './components/WalletButton'
import type { AppData } from './components/appData'
import { useCatalog } from './hooks/useCatalog'
import { useMe } from './hooks/useMe'

type TabId = 'catalog' | 'player' | 'artist' | 'creator' | 'brand'

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'catalog', label: 'Catalog', icon: Music2 },
  { id: 'player', label: 'My access', icon: KeyRound },
  { id: 'artist', label: 'Artist', icon: Mic2 },
  { id: 'creator', label: 'Creator', icon: Disc3 },
  { id: 'brand', label: 'Brand', icon: Megaphone },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('catalog')
  const { address } = useAccount()
  const { catalog, isLoading, isError, refetch } = useCatalog()
  const releaseIds = useMemo(() => catalog.releases.map((r) => r.id), [catalog.releases])
  const { me } = useMe(releaseIds)

  const data: AppData = useMemo(
    () => ({
      catalog,
      me,
      address,
      songById: new Map(catalog.songs.map((s) => [s.id, s])),
      loading: isLoading,
    }),
    [catalog, me, address, isLoading],
  )

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-20 border-b backdrop-blur-xl" style={{ background: 'rgba(249,249,252,0.82)', borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: 'var(--accent)' }}>
              <AudioLines size={22} />
            </span>
            <div className="leading-tight">
              <p className="display text-lg font-semibold">SoundBeats</p>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>Releases on Arc Testnet</p>
            </div>
          </div>
          <WalletButton usdcBalance={me.usdcBalance} />
        </div>
        <nav className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors"
              style={tab === id ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--ink-2)' }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {isError && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
            <span>Could not load the catalog from Arc Testnet.</span>
            <button type="button" onClick={() => void refetch()} className="min-h-[44px] px-2 font-semibold underline">Retry</button>
          </div>
        )}
        {tab === 'catalog' && <CatalogPage data={data} />}
        {tab === 'player' && <PlayerPage data={data} />}
        {tab === 'artist' && <ArtistPage data={data} />}
        {tab === 'creator' && <CreatorPage data={data} />}
        {tab === 'brand' && <BrandPage data={data} />}
      </main>
    </div>
  )
}
