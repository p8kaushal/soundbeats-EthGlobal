/**
 * Seeds the SoundBeats catalog (scripts/manifest.csv, songs from Audius) into SoundBeatsReleases.
 *
 *   gen  -> creates a funder/creator wallet + one throwaway wallet per artist (keys file, never printed)
 *   run  -> funds artists with gas, registers every song from its artist wallet, publishes one release per song
 *
 * Re-runnable: progress is saved in the keys file, finished steps are skipped.
 * These are throwaway Arc Testnet wallets; nothing here is real money.
 */
import fs from 'node:fs'
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { soundBeats, USDC_ADDRESS } from '../src/contracts/soundBeats'
import { encodeSongMeta } from '../src/lib/metadata'

const KEYS_FILE = process.env.SEED_KEYS_FILE || '/tmp/soundbeats-manifest-keys.json'
const RPC = 'https://rpc.testnet.arc.io'
const usdc = (v: string) => parseUnits(v, 6) // ERC-20 interface, 6 decimals

type Row = { pool: string; title: string; artist: string }
function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean)
  const out: Row[] = []
  for (const line of lines.slice(1)) {
    const cells: string[] = []; let cur = ''; let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
      else if (ch === '"') q = true; else if (ch === ',') { cells.push(cur); cur = '' } else cur += ch
    }
    cells.push(cur)
    out.push({ pool: cells[0].trim(), title: cells[1].trim(), artist: cells[2].trim() })
  }
  return out
}
const rows = parseCsv(fs.readFileSync(new URL('./manifest.csv', import.meta.url), 'utf8'))
const artists = [...new Set(rows.map(r => r.artist))]

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'track' }
function hash(s: string) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h }
const PRICES = ['0.25', '0.50', '1.00']

interface Keys { funder: `0x${string}`; artists: Record<string, `0x${string}`>; funded: string[]; songs: Record<string, string>; releases: Record<string, string> }
const load = (): Keys => JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'))
const save = (k: Keys) => fs.writeFileSync(KEYS_FILE, JSON.stringify(k), { mode: 0o600 })

const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC) })
async function wait(h: `0x${string}`, label: string) {
  const r = await pub.waitForTransactionReceipt({ hash: h })
  if (r.status !== 'success') throw new Error(`${label} reverted: ${h}`)
  console.log('ok', label)
}

function gen() {
  if (fs.existsSync(KEYS_FILE)) { console.log('keys exist; funder:', privateKeyToAccount(load().funder).address); return }
  const k: Keys = { funder: generatePrivateKey(), artists: {}, funded: [], songs: {}, releases: {} }
  for (const a of artists) k.artists[a] = generatePrivateKey()
  save(k)
  console.log(`songs ${rows.length}, artists ${artists.length}`)
  console.log('funder (send test USDC here):', privateKeyToAccount(k.funder).address)
}

async function run() {
  const k = load()
  const funder = privateKeyToAccount(k.funder)
  const fc = createWalletClient({ account: funder, chain: arcTestnet, transport: http(RPC) })
  const bal = await pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [funder.address] })
  console.log('funder', funder.address, 'USDC', Number(bal) / 1e6)

  for (const a of artists) {
    if (k.funded.includes(a)) continue
    const n = rows.filter(r => r.artist === a).length
    const amt = usdc((0.01 * n + 0.02).toFixed(2))
    const acct = privateKeyToAccount(k.artists[a])
    await wait(await fc.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [acct.address, amt] }), `fund ${a}`)
    k.funded.push(a); save(k)
  }

  for (const r of rows) {
    const key = `${r.artist}::${r.title}`
    if (k.songs[key]) continue
    const acct = privateKeyToAccount(k.artists[r.artist])
    const c = createWalletClient({ account: acct, chain: arcTestnet, transport: http(RPC) })
    const meta = encodeSongMeta({ artistName: r.artist, album: `${r.artist} – Collection`, genre: 'Audius', cover: `https://picsum.photos/seed/${slug(r.artist + '-' + r.title)}/400` })
    const { result, request } = await pub.simulateContract({ account: acct, address: soundBeats.address, abi: soundBeats.abi, functionName: 'registerSong', args: [r.title.slice(0, 100), acct.address, meta] })
    await wait(await c.writeContract(request), `song ${r.title}`)
    k.songs[key] = String(result); save(k)
  }

  for (const r of rows) {
    const key = `${r.artist}::${r.title}`
    if (k.releases[key]) continue
    const h = hash(key)
    const source = r.pool === 'beatmap' ? 1 : 0 // 1 = manual (hand-made), 0 = auto
    const difficulty = 2 + (h % 8)
    const price = usdc(PRICES[h % PRICES.length])
    const beatmapId = `${slug(r.title)}-${source ? 'hand' : 'auto'}-${difficulty}`
    const { result, request } = await pub.simulateContract({ account: funder, address: soundBeats.address, abi: soundBeats.abi, functionName: 'publishRelease', args: [BigInt(k.songs[key]), beatmapId, source, difficulty, price, funder.address] })
    await wait(await fc.writeContract(request), `release ${beatmapId}`)
    k.releases[key] = String(result); save(k)
  }
  console.log('songCount', String(await pub.readContract({ address: soundBeats.address, abi: soundBeats.abi, functionName: 'songCount' })))
  console.log('releaseCount', String(await pub.readContract({ address: soundBeats.address, abi: soundBeats.abi, functionName: 'releaseCount' })))
}

const mode = process.argv[2]
if (mode === 'gen') gen(); else if (mode === 'run') await run(); else console.log('usage: gen|run')
