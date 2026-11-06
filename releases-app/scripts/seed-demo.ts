/**
 * Seeds the deployed SoundBeatsReleases contract with 3 demo songs and 3 releases.
 *
 *   bun scripts/seed-demo.ts gen   creates throwaway demo wallets (keys in /tmp, never printed)
 *   bun scripts/seed-demo.ts run   funds the artist wallets and registers the demo catalog
 *
 * The demo artist and creator wallets are throwaway Arc Testnet wallets. Nobody holds
 * their keys after seeding, so demo earnings are not withdrawable (they are not real money).
 */

import fs from 'node:fs'
import { createPublicClient, createWalletClient, erc20Abi, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { soundBeats, USDC_ADDRESS } from '../src/contracts/soundBeats'
import { encodeSongMeta } from '../src/lib/metadata'
import { getChain } from '../src/onchain-facts'
import { parseUsdc } from '../src/onchain-money'

const KEYS_FILE = '/tmp/soundbeats-demo-keys.json'

interface KeyFile {
  creator: `0x${string}`
  artists: `0x${string}`[]
}

const DEMO = [
  { title: 'Neon Skyline', artistName: 'Kairo Vale', genre: 'Synthwave', bpm: 112, beatmapId: 'nsk-hand-7', source: 1, difficulty: 7, price: '1.00' },
  { title: 'Glass Garden', artistName: 'Mina Solis', genre: 'Future Bass', bpm: 140, beatmapId: 'glg-auto-3', source: 0, difficulty: 3, price: '0.25' },
  { title: 'Last Train to Osaka', artistName: 'Tidal Hours', genre: 'Drum and Bass', bpm: 174, beatmapId: 'ltto-hand-9', source: 1, difficulty: 9, price: '2.00' },
] as const

const rpc = getChain(arcTestnet.id)?.rpcUrls[0]
if (!rpc) throw new Error('No Arc Testnet RPC in onchain facts')
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })

function readKeys(): KeyFile {
  return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')) as KeyFile
}

function gen() {
  const creator = generatePrivateKey()
  const artists = DEMO.map(() => generatePrivateKey())
  fs.writeFileSync(KEYS_FILE, JSON.stringify({ creator, artists }), { mode: 0o600 })
  console.log('creator (fund this address with test USDC):', privateKeyToAccount(creator).address)
}

async function run() {
  const keys = readKeys()
  const creator = privateKeyToAccount(keys.creator)
  const creatorClient = createWalletClient({ account: creator, chain: arcTestnet, transport: http(rpc) })

  const balance = await publicClient.readContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [creator.address],
  })
  console.log('creator USDC balance (raw):', balance.toString())
  if (balance < parseUsdc('1')) throw new Error('Fund the creator wallet with test USDC first')

  const send = async (hash: `0x${string}`, label: string) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`${label} reverted: ${hash}`)
    console.log('ok', label, hash)
  }

  // Each artist wallet needs a little USDC for gas to register its own song.
  for (const [i, key] of keys.artists.entries()) {
    const artist = privateKeyToAccount(key)
    const hash = await creatorClient.writeContract({
      address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [artist.address, parseUsdc('0.3')],
    })
    await send(hash, `fund artist ${i + 1}`)
  }

  const songIds: bigint[] = []
  for (const [i, key] of keys.artists.entries()) {
    const artist = privateKeyToAccount(key)
    const client = createWalletClient({ account: artist, chain: arcTestnet, transport: http(rpc) })
    const demo = DEMO[i]
    const hash = await client.writeContract({
      address: soundBeats.address,
      abi: soundBeats.abi,
      functionName: 'registerSong',
      args: [demo.title, artist.address, encodeSongMeta({ artistName: demo.artistName, genre: demo.genre, bpm: demo.bpm })],
    })
    await send(hash, `registerSong ${demo.title}`)
    songIds.push(await publicClient.readContract({ address: soundBeats.address, abi: soundBeats.abi, functionName: 'songCount' }))
  }

  for (const [i, songId] of songIds.entries()) {
    const demo = DEMO[i]
    const hash = await creatorClient.writeContract({
      address: soundBeats.address,
      abi: soundBeats.abi,
      functionName: 'publishRelease',
      args: [songId, demo.beatmapId, demo.source, demo.difficulty, parseUsdc(demo.price), creator.address],
    })
    await send(hash, `publishRelease ${demo.beatmapId}`)
  }
  console.log('songCount', (await publicClient.readContract({ address: soundBeats.address, abi: soundBeats.abi, functionName: 'songCount' })).toString())
  console.log('releaseCount', (await publicClient.readContract({ address: soundBeats.address, abi: soundBeats.abi, functionName: 'releaseCount' })).toString())
}

const mode = process.argv[2]
if (mode === "gen") gen()
else if (mode === 'run') await run()
else console.log('usage: bun scripts/seed-demo.ts gen|run')
