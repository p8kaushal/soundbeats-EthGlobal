import { formatUnitsExact, parseUsdc } from '../onchain-money'
import { USDC_DECIMALS } from '../onchain-facts'

/** "1", "0.25", "12.5" -> always at least two decimals, never more than the token has. */
export function fmtUsdc(raw: bigint): string {
  const exact = formatUnitsExact(raw, USDC_DECIMALS)
  const [whole, fraction = ''] = exact.split('.')
  const padded = fraction.padEnd(2, '0')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas}.${padded}`
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function sameAddress(a?: string, b?: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

/** Platform fee is 0% at deploy; the split shown here is the 70/30 rule on the gross price. */
export function splitPreview(gross: bigint): { artist: bigint; creator: bigint } {
  const artist = (gross * 7000n) / 10000n
  return { artist, creator: gross - artist }
}


/** Parses user-typed USDC; null when empty, malformed, over 6 decimals, or not positive. */
export function tryParseUsdc(input: string): bigint | null {
  if (!input.trim()) return null
  try {
    const raw = parseUsdc(input)
    return raw > 0n ? raw : null
  } catch {
    return null
  }
}
