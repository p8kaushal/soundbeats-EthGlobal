// Arkiv catalog records for artist uploads. Same writer wallet and env vars as the
// photo-to-music app (ARKIV_PRIVATE_KEY, ARKIV_ACCESS_KEY in ~/secrets/arkiv.env),
// but a separate schema so the game's track list is not affected.
import { ExpirationTime, createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { bytes, defineSchema, str } from '@arkiv-network/sdk/schema';
import { hexToString, http, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const ARKIV_WRITER = '0xf5D6dd74586be3a2C95D29E33226821f6fD0d8d8';
export const ARKIV_CHAIN_ID = 7794095;
export const ARKIV_EXPLORER = 'https://rabdi.explorer.arkiv.network';
export const SCHEMA_NAME = 'soundbeats.ethglobal.artist_songs.v1';

const ArtistSongs = defineSchema(SCHEMA_NAME, {
  uploadId: str().indexed(),
  arcSongId: str().indexed(),
  artist: str().indexed(),
  title: str(),
  audioKey: str(),
  artworkKey: str(),
  metadata: bytes(),
});

export const arkivConfigured = () => Boolean(process.env.ARKIV_PRIVATE_KEY && process.env.ARKIV_ACCESS_KEY);
export const arkivEntityUrl = key => (key ? `${ARKIV_EXPLORER}/entity/${key}` : null);

function clients({ write = false } = {}) {
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY || '' });
  const publicClient = createPublicClient({ chain, transport: http() });
  if (!write) return { publicClient };
  if (!arkivConfigured()) throw new Error('Arkiv publishing is not configured.');
  const raw = process.env.ARKIV_PRIVATE_KEY;
  const account = privateKeyToAccount(raw.startsWith('0x') ? raw : `0x${raw}`);
  if (account.address.toLowerCase() !== ARKIV_WRITER.toLowerCase()) throw new Error('Arkiv writer key does not match the configured public wallet.');
  return { publicClient, walletClient: createWalletClient({ chain, transport: http(), account }) };
}

export async function publishArtistSong(record) {
  const { walletClient } = clients({ write: true });
  const result = await walletClient.createEntity(ArtistSongs, {
    uploadId: record.uploadId,
    arcSongId: record.arcSongId,
    artist: record.artist.toLowerCase(),
    title: record.title,
    audioKey: record.audioKey,
    artworkKey: record.artworkKey,
    metadata: stringToHex(JSON.stringify({ schema: SCHEMA_NAME, ...record })),
  }, { expiration: ExpirationTime.fromDays(180) });
  return { entityKey: result.entityKey, txHash: result.txHash ?? null, writer: ARKIV_WRITER, chainId: ARKIV_CHAIN_ID, schema: SCHEMA_NAME };
}

export async function listArtistSongs() {
  const { publicClient } = clients();
  const { entities } = await publicClient.select({ $key: true, metadata: true }).from(ArtistSongs).ownedBy(ARKIV_WRITER).fetch();
  return entities.map(e => ({ entityKey: e.$key, ...JSON.parse(hexToString(e.metadata.value)) }));
}
