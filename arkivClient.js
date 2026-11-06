import { ExpirationTime, createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { bytes, defineSchema, str } from '@arkiv-network/sdk/schema';
import { http, hexToString, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const ARKIV_WRITER = '0xf5D6dd74586be3a2C95D29E33226821f6fD0d8d8';
export const ARKIV_CHAIN_ID = 7794095;
export const ARKIV_EXPLORER = 'https://rabdi.explorer.arkiv.network';

export const Tracks = defineSchema('soundbeats.ethglobal.tracks.v1', {
  trackId: str().indexed(),
  source: str().indexed(),
  beatmapSource: str().indexed(),
  difficulty: str().indexed(),
  title: str(),
  creator: str(),
  audioUrl: str(),
  beatmapUrl: str(),
  metadata: bytes(),
});

function clients({ write = false } = {}) {
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY || '' });
  const publicClient = createPublicClient({ chain, transport: http() });
  if (!write) return { publicClient };
  if (!process.env.ARKIV_PRIVATE_KEY || !process.env.ARKIV_ACCESS_KEY) throw new Error('Arkiv publishing is not configured.');
  const key = process.env.ARKIV_PRIVATE_KEY.startsWith('0x') ? process.env.ARKIV_PRIVATE_KEY : `0x${process.env.ARKIV_PRIVATE_KEY}`;
  const account = privateKeyToAccount(key);
  if (account.address.toLowerCase() !== ARKIV_WRITER.toLowerCase()) throw new Error('Arkiv writer key does not match the configured public wallet.');
  return { publicClient, walletClient: createWalletClient({ chain, transport: http(), account }), account };
}

export function arkivConfigured() { return Boolean(process.env.ARKIV_PRIVATE_KEY && process.env.ARKIV_ACCESS_KEY); }

export function trackValues(metadata) {
  return {
    trackId: metadata.trackId,
    source: metadata.source,
    beatmapSource: metadata.beatmapSource,
    difficulty: String(metadata.difficulty),
    title: metadata.title,
    creator: metadata.creator,
    audioUrl: metadata.audioUrl,
    beatmapUrl: metadata.beatmapUrl,
    metadata: bytes(stringToHex(JSON.stringify(metadata))),
  };
}

export async function publishTrack(metadata) {
  const { walletClient } = clients({ write: true });
  try {
    const { entityKey, txHash, expiresAt } = await walletClient.createEntity(Tracks, trackValues(metadata), { expiration: ExpirationTime.fromDays(180) });
    return { entityKey, txHash, expiresAt: String(expiresAt), writer: ARKIV_WRITER, chainId: ARKIV_CHAIN_ID };
  } catch (error) {
    // The SDK may lose the receipt after a transaction is sent. Do not silently
    // resubmit an uncertain transaction: it could create a duplicate entity.
    if (error?.name === 'EntityMutationError') error.arkivMayHaveSubmitted = true;
    throw error;
  }
}

export async function listTracks() {
  const { publicClient } = clients();
  const { entities } = await publicClient.select({ $key: true, metadata: true }).from(Tracks).ownedBy(ARKIV_WRITER).fetch();
  return entities.map(entity => ({ entityKey: entity.$key, ...JSON.parse(hexToString(entity.metadata.value)) })).reverse();
}
