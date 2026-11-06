import assert from 'node:assert/strict'
import { submitAndConfirm, TransactionUncertainError, isAmbiguousRpcError } from '../src/lib/transactionRecovery'

const hash = `0x${'1'.repeat(64)}` as const
let cases = 0
async function scenario(name: string, run: () => Promise<void>) {
  await run(); cases++; console.log('PASS', name)
}
const base = {
  onHash: () => {}, onChecking: () => {}, attempts: 2, pause: async () => {},
}

await scenario('normal receipt succeeds; submit exactly once', async () => {
  let sends = 0
  assert.equal(await submitAndConfirm({
    ...base, submit: async () => { sends++; return hash },
    receipt: async () => ({ status: 'success' }),
  }), hash)
  assert.equal(sends, 1)
})
await scenario('already-known approval reconciles allowance without resending', async () => {
  let sends = 0; let reads = 0
  assert.equal(await submitAndConfirm({
    ...base, submit: async () => { sends++; throw new Error('eth_sendRawTransaction: already known') },
    receipt: async () => { throw new Error('must not read without hash') },
    effect: async () => ++reads === 2,
  }), undefined)
  assert.equal(sends, 1)
  assert.equal(reads, 2)
})
await scenario('rate-limited purchase succeeds only when access is observed', async () => {
  assert.equal(await submitAndConfirm({
    ...base, submit: async () => { throw new Error('Request is being rate limited') },
    receipt: async () => ({ status: 'success' }), effect: async () => true,
  }), undefined)
})
await scenario('no access remains uncertain, not success or confirmed revert', async () => {
  await assert.rejects(submitAndConfirm({
    ...base, submit: async () => { throw new Error('already known') },
    receipt: async () => ({ status: 'success' }), effect: async () => false,
  }), TransactionUncertainError)
})
await scenario('receipt timeout preserves hash and recovers without resending', async () => {
  let sends = 0; let receipts = 0
  assert.equal(await submitAndConfirm({
    ...base, submit: async () => { sends++; return hash },
    receipt: async () => { if (++receipts === 1) throw new Error('timeout'); return { status: 'success' } },
  }), hash)
  assert.equal(sends, 1)
})
await scenario('genuine receipt revert stays failed even if effect says true', async () => {
  await assert.rejects(submitAndConfirm({
    ...base, submit: async () => hash,
    receipt: async () => ({ status: 'reverted' }), effect: async () => true,
  }), /reverted onchain/)
})
await scenario('read failures do not invent success', async () => {
  await assert.rejects(submitAndConfirm({
    ...base, submit: async () => { throw new Error('already known') },
    receipt: async () => ({ status: 'success' }),
    effect: async () => { throw new Error('RPC unavailable') },
  }), TransactionUncertainError)
})
await scenario('wallet rejection propagates without recovery', async () => {
  let reads = 0
  await assert.rejects(submitAndConfirm({
    ...base, submit: async () => { throw new Error('User rejected request') },
    receipt: async () => ({ status: 'success' }),
    effect: async () => { reads++; return true },
  }), /User rejected/)
  assert.equal(reads, 0)
})
await scenario('nested transport errors detected, custom contract failures not swallowed', async () => {
  assert.equal(isAmbiguousRpcError({ cause: { details: 'eth_sendRawTransaction: already known' } }), true)
  assert.equal(isAmbiguousRpcError(new Error('ReleaseInactive')), false)
})
console.log(`${cases} recovery tests passed. No network calls or transactions sent.`)
