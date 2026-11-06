import { useState } from 'react'
import { ReleaseCard } from './ReleaseCard'
import { Empty, SectionTitle } from './ui'
import type { AppData } from './appData'

type Filter = 'all' | 'auto' | 'manual'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'auto', label: 'Auto map' },
  { id: 'manual', label: 'Hand-made' },
]

export function CatalogPage({ data }: { data: AppData }) {
  const [filter, setFilter] = useState<Filter>('all')
  const releases = [...data.catalog.releases].reverse().filter((r) => filter === 'all' || r.source === filter)

  return (
    <div className="space-y-4">
      <SectionTitle title="New releases" hint="Pay once in USDC. 70% goes to the artist and 30% to the beatmap creator, instantly." />
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter releases">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className="min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors"
            style={
              filter === f.id
                ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                : { background: 'var(--surface-strong)', borderColor: 'var(--border)' }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {data.loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl" style={{ background: 'var(--surface-muted)' }} />
          ))}
        </div>
      ) : releases.length === 0 ? (
        <Empty title="No releases yet" body="Beatmap creators publish releases from the Creator tab." />
      ) : (
        releases.map((release) => <ReleaseCard key={release.id} release={release} data={data} />)
      )}
    </div>
  )
}
