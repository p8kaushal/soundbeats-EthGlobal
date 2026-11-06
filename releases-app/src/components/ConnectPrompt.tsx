import { Card } from './ui'
import { WalletButton } from './WalletButton'

export function ConnectPrompt({ message }: { message: string }) {
  return (
    <Card className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="mx-auto max-w-xs text-pretty" style={{ color: 'var(--ink-2)' }}>{message}</p>
      <WalletButton usdcBalance={0n} />
    </Card>
  )
}
