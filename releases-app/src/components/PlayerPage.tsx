import { ConnectPrompt } from './ConnectPrompt'
import { ReleaseCard } from './ReleaseCard'
import { Empty, SectionTitle } from './ui'
import type { AppData } from './appData'

export function PlayerPage({ data }: { data: AppData }) {
  if (!data.address) return <ConnectPrompt message="Connect your wallet to see the releases you own." />

  const owned = data.catalog.releases.filter((r) => data.me.access.has(r.id))
  const claimable = data.catalog.releases.filter(
    (r) => !data.me.access.has(r.id) && (data.catalog.passStats[r.id]?.remaining ?? 0) > 0,
  )

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionTitle title="My access" hint="Releases your wallet can play in the game." />
        {owned.length === 0 ? (
          <Empty title="Nothing unlocked yet" body="Buy a release in the catalog or claim a free sponsored pass below." />
        ) : (
          owned.map((release) => <ReleaseCard key={release.id} release={release} data={data} />)
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle title="Free passes" hint="Brands prepay these. You can claim one per release." />
        {claimable.length === 0 ? (
          <Empty title="No free passes right now" body="When a brand sponsors a release, its passes show up here." />
        ) : (
          claimable.map((release) => <ReleaseCard key={release.id} release={release} data={data} />)
        )}
      </section>
    </div>
  )
}
