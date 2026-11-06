/** Transport uncertainty is not evidence of an on-chain revert. */
export function isAmbiguousRpcError(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current = error
  let text = ''
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const e = current as { message?: string; shortMessage?: string; details?: string; cause?: unknown }
    text += ` ${e.message ?? ''} ${e.shortMessage ?? ''} ${e.details ?? ''}`
    current = e.cause
  }
  return /already known|known transaction|rate.?limit|too many requests|\b429\b|timed? ?out|timeout|failed to fetch|network error|nonce too low/i.test(text)
}

type Hash = `0x${string}`
export class TransactionUncertainError extends Error {
  constructor(public hash?: Hash) {
    super('Confirmation is uncertain. Check MetaMask Activity and the explorer before retrying. Do not submit again while a transaction is pending.')
  }
}

class ReceiptRevertedError extends Error {
  constructor() { super('The transaction was reverted onchain.') }
}

type Options = {
  submit: () => Promise<Hash>
  receipt: (hash: Hash) => Promise<{ status: 'success' | 'reverted' }>
  /** Read-only proof of desired effect, e.g. allowance >= spend or hasAccess. */
  effect?: () => Promise<boolean>
  onHash: (hash: Hash) => void
  onChecking: (hash?: Hash) => void
  attempts?: number
  pause?: () => Promise<void>
}

export async function submitAndConfirm({
  submit, receipt, effect, onHash, onChecking,
  attempts = 8,
  pause = () => new Promise(resolve => setTimeout(resolve, 3000)),
}: Options): Promise<Hash | undefined> {
  let hash: Hash | undefined
  try {
    // Exactly one submit. Only read-only checks are retried below.
    hash = await submit()
    onHash(hash)
    const result = await receipt(hash)
    if (result.status !== 'success') throw new ReceiptRevertedError()
    return hash
  } catch (error) {
    if (error instanceof ReceiptRevertedError) throw error
    if (!hash && !isAmbiguousRpcError(error)) throw error
  }

  onChecking(hash)
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await pause()
    try {
      if (hash) {
        const result = await receipt(hash)
        if (result.status !== 'success') throw new ReceiptRevertedError()
        return hash
      }
      if (effect && await effect()) return undefined
    } catch (error) {
      if (error instanceof ReceiptRevertedError) throw error
      // A read failure is inconclusive. Never turn it into a success or resubmit.
    }
  }
  throw new TransactionUncertainError(hash)
}
