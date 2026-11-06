// Arc payments for AI levels.
//
// When a creator publishes an AI level, the server's publisher wallet lists it on the existing
// SoundBeatsReleases contract (Arc Testnet), then hands both payout roles (artist 70% + creator 30%)
// to the SoundBeats payout wallet. Players pay the price in USDC straight to that wallet;
// the contract never holds funds. The play page checks hasAccess(release, wallet) on-chain
// before it gives out the game link.
//
//   ARC_PUBLISHER_KEY   private key of the server publisher wallet (only needs a little test USDC for gas)
//   ARC_PAYOUT_WALLET   wallet that receives 100% of each sale
//   ARC_PRICE_USDC      price per level, default 1.5
//   ARC_CONTRACT        SoundBeatsReleases address (default: the live Arc Testnet deployment)
//   ARC_RPC_URL         optional RPC override; otherwise viem's Arc Testnet RPC list with fallback
//   ARC_LINK_SECRET     optional secret for signed play links (derived from the publisher key if empty)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createPublicClient, createWalletClient, fallback, getAddress, http, isAddress, parseAbi, parseEventLogs, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';

export const ARC_CHAIN_ID = arcTestnet.id; // 5042002
export const ARC_EXPLORER = 'https://explorer.testnet.arc.io';
export const ARC_USDC = '0x3600000000000000000000000000000000000000';
const DEFAULT_CONTRACT = '0x71a39b29e81497af2d8c3ab315ce3d778e999471';
const DEFAULT_PAYOUT = '0xE4bd45C71e54f851d0c0349339B2aEDA551b7f49';

export const releasesAbi = parseAbi([
  'function registerSong(string title, address artist, string metadataURI) returns (uint256)',
  'function publishRelease(uint256 songId, string beatmapId, uint8 source, uint8 difficulty, uint256 price, address creator) returns (uint256)',
  'function updateReleaseArtistWallet(uint256 releaseId, address newWallet)',
  'function updateReleaseCreatorWallet(uint256 releaseId, address newWallet)',
  'function hasAccess(uint256 releaseId, address wallet) view returns (bool)',
  'event SongRegistered(uint256 indexed songId, address indexed artist, string title, string metadataURI)',
  'event ReleasePublished(uint256 indexed releaseId, uint256 indexed songId, address artist, address indexed creator, string beatmapId, uint8 source, uint8 difficulty, uint256 price)',
]);

const env = name => (process.env[name] || '').trim();
export const arcContract = () => getAddress(env('ARC_CONTRACT') || DEFAULT_CONTRACT);
export const arcPayoutWallet = () => getAddress(env('ARC_PAYOUT_WALLET') || DEFAULT_PAYOUT);
export const arcPriceUnits = () => parseUnits(env('ARC_PRICE_USDC') || '1.5', 6);
export const arcConfigured = () => Boolean(env('ARC_PUBLISHER_KEY'));

function transport() {
  const custom = env('ARC_RPC_URL');
  const urls = custom ? [custom] : arcTestnet.rpcUrls.default.http;
  return fallback(urls.map(url => http(url, { retryCount: 1, timeout: 20_000 })));
}
let publicClient;
export const arcPublic = () => (publicClient ||= createPublicClient({ chain: arcTestnet, transport: transport() }));
function publisher() {
  const raw = env('ARC_PUBLISHER_KEY');
  if (!raw) throw new Error('Arc publishing is not configured.');
  const account = privateKeyToAccount(raw.startsWith('0x') ? raw : `0x${raw}`);
  return { account, wallet: createWalletClient({ chain: arcTestnet, transport: transport(), account }) };
}
export const arcPublisherAddress = () => (arcConfigured() ? publisher().account.address : null);

// Public info the play page needs to build the approve + buyAccess transactions.
export function arcPublicInfo(release) {
  return {
    chainId: ARC_CHAIN_ID,
    chainIdHex: `0x${ARC_CHAIN_ID.toString(16)}`,
    rpcUrl: env('ARC_RPC_URL') || arcTestnet.rpcUrls.default.http[0],
    explorer: ARC_EXPLORER,
    contract: arcContract(),
    usdc: ARC_USDC,
    payoutWallet: arcPayoutWallet(),
    releaseId: release ? String(release.releaseId) : null,
    price: release ? String(release.price) : String(arcPriceUnits()),
    priceUsdc: formatUnits(release ? BigInt(release.price) : arcPriceUnits(), 6),
  };
}

async function send(wallet, account, functionName, args) {
  const client = arcPublic();
  const { request } = await client.simulateContract({ account, address: arcContract(), abi: releasesAbi, functionName, args });
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`Arc transaction ${functionName} reverted (${hash}).`);
  return receipt;
}

// Lists one AI level for sale. `progress` is the saved partial result (so a retry resumes
// instead of registering a second song); `onProgress` persists each step.
export async function publishOnArc({ title, metadataURI, beatmapId, difficulty, progress = {}, onProgress = async () => {} }) {
  const { account, wallet } = publisher();
  const payout = arcPayoutWallet();
  const state = { ...progress, contract: arcContract(), chainId: ARC_CHAIN_ID, payoutWallet: payout, publisher: account.address, txs: { ...(progress.txs || {}) } };
  const cleanTitle = String(title || 'SoundBeats AI level').slice(0, 100) || 'SoundBeats AI level';
  if (!state.songId) {
    const receipt = await send(wallet, account, 'registerSong', [cleanTitle, account.address, String(metadataURI || '').slice(0, 512)]);
    const [log] = parseEventLogs({ abi: releasesAbi, eventName: 'SongRegistered', logs: receipt.logs });
    if (!log) throw new Error('Arc did not report the registered song.');
    state.songId = String(log.args.songId); state.txs.registerSong = receipt.transactionHash; await onProgress(state);
  }
  if (!state.releaseId) {
    const price = arcPriceUnits();
    const receipt = await send(wallet, account, 'publishRelease', [BigInt(state.songId), beatmapId.slice(0, 64), 0, difficulty, price, account.address]);
    const [log] = parseEventLogs({ abi: releasesAbi, eventName: 'ReleasePublished', logs: receipt.logs });
    if (!log) throw new Error('Arc did not report the published release.');
    state.releaseId = String(log.args.releaseId); state.price = String(price); state.txs.publishRelease = receipt.transactionHash; await onProgress(state);
  }
  if (payout.toLowerCase() !== account.address.toLowerCase()) {
    if (!state.txs.artistWallet) { state.txs.artistWallet = (await send(wallet, account, 'updateReleaseArtistWallet', [BigInt(state.releaseId), payout])).transactionHash; await onProgress(state); }
    if (!state.txs.creatorWallet) { state.txs.creatorWallet = (await send(wallet, account, 'updateReleaseCreatorWallet', [BigInt(state.releaseId), payout])).transactionHash; await onProgress(state); }
  }
  state.complete = true; state.publishedAt ||= new Date().toISOString();
  await onProgress(state);
  return state;
}

export async function hasArcAccess(releaseId, wallet) {
  return arcPublic().readContract({ address: arcContract(), abi: releasesAbi, functionName: 'hasAccess', args: [BigInt(releaseId), getAddress(wallet)] });
}

// Signed play links: issued only after hasAccess is confirmed on-chain (access is permanent).
const linkSecret = () => env('ARC_LINK_SECRET') || createHmac('sha256', env('ARC_PUBLISHER_KEY') || 'unset').update('soundbeats-play-link').digest('hex');
export function signAccess(trackId, difficulty, wallet) {
  return createHmac('sha256', linkSecret()).update(`${trackId}:${difficulty}:${String(wallet).toLowerCase()}`).digest('base64url').slice(0, 32);
}
export function verifyAccess(trackId, difficulty, wallet, sig) {
  if (!wallet || !sig || !isAddress(wallet)) return false;
  const expected = Buffer.from(signAccess(trackId, difficulty, wallet)), given = Buffer.from(String(sig));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
