// SoundBeats Releases artist upload API.
//
// Flow: the artist creates a draft, uploads an MP3 and artwork (stored privately in S3),
// registers the song on Arc from their own wallet with the draft id in its metadata, then
// asks this server to finalize. The server checks the Arc receipt itself and only then
// writes the catalog record to Arkiv. The server never holds an artist's key.
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPublicClient, decodeEventLog, fallback, getAddress, http as viemHttp, isAddressEqual } from 'viem';
import { arcTestnet } from 'viem/chains';
import { arkivConfigured, arkivEntityUrl, publishArtistSong } from './arkiv.js';
import { UploadError, cleanText, isAddress, isTxHash, isUploadId, parseSongMeta, validateFile, LIMITS } from './media.js';
import { soundBeatsEvents } from './abi.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(root, 'data', 'uploads');
await mkdir(dataDir, { recursive: true });

const port = Number(process.env.PORT || 3300);
const bucket = process.env.MEDIA_BUCKET || 'soundbeats-ethglobal-media-20261106';
const region = process.env.AWS_REGION || 'ap-northeast-1';
const prefix = (process.env.MEDIA_PREFIX || 'artist_uploads').replace(/\/+$/, '');
const publicBase = (process.env.PUBLIC_BASE_URL || 'https://arc.ethglobal.soundbeats.io').replace(/\/+$/, '');
const CONTRACT = getAddress(process.env.RELEASES_CONTRACT || '0x71a39b29e81497af2d8c3ab315ce3d778e999471');

const s3 = new S3Client({ region });
const arc = createPublicClient({
  chain: arcTestnet,
  transport: fallback([
    viemHttp('https://rpc.blockdaemon.testnet.arc.io', { retryCount: 1 }),
    viemHttp('https://rpc.testnet.arc.io', { retryCount: 1 }),
    viemHttp('https://rpc.drpc.testnet.arc.io', { retryCount: 1 }),
  ]),
});

// ---------- storage of upload records (small JSON files, no secrets) ----------
const records = new Map();
for (const file of await readdir(dataDir)) if (file.endsWith('.json')) {
  try { const r = JSON.parse(await readFile(path.join(dataDir, file), 'utf8')); records.set(r.id, r); } catch { /* skip broken file */ }
}
const save = async record => { record.updatedAt = new Date().toISOString(); records.set(record.id, record); await writeFile(path.join(dataDir, `${record.id}.json`), JSON.stringify(record, null, 2)); };
const publicRecord = r => ({
  id: r.id, status: r.status, title: r.title, artistName: r.artistName, genre: r.genre, wallet: r.wallet,
  audio: r.audio ? { url: `${publicBase}/api/media/${r.id}/audio`, size: r.audio.size, sha256: r.audio.sha256 } : null,
  artwork: r.artwork ? { url: `${publicBase}/api/media/${r.id}/artwork`, size: r.artwork.size, sha256: r.artwork.sha256 } : null,
  arc: r.arc || null,
  arkiv: r.arkiv ? { ...r.arkiv, url: arkivEntityUrl(r.arkiv.entityKey) } : null,
  arkivError: r.arkivError || null,
  createdAt: r.createdAt, updatedAt: r.updatedAt,
});

// ---------- http helpers ----------
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const hits = new Map();
function limited(req, name, limit, windowMs) {
  const key = `${name}:${clientIp(req)}`, now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
  recent.push(now); hits.set(key, recent);
  return recent.length > limit;
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > max) { reject(new UploadError(413, `The file is larger than ${max / 1024 / 1024} MB.`)); req.resume(); return; }
    const chunks = []; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > max) { reject(new UploadError(413, `The file is larger than ${max / 1024 / 1024} MB.`)); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async req => { try { return JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}'); } catch (e) { if (e instanceof UploadError) throw e; throw new UploadError(400, 'Invalid JSON.'); } };

// ---------- handlers ----------
async function createDraft(req, res) {
  if (limited(req, 'draft', 20, 60 * 60 * 1000)) throw new UploadError(429, 'Too many uploads from this network. Try again later.');
  const body = await readJson(req);
  const title = cleanText(body.title, 100);
  if (!title) throw new UploadError(400, 'Add a song title.');
  if (!isAddress(body.wallet)) throw new UploadError(400, 'Connect your wallet first.');
  const record = {
    id: randomUUID(), status: 'draft', title,
    artistName: cleanText(body.artistName, 60), genre: cleanText(body.genre, 40),
    wallet: getAddress(body.wallet), createdAt: new Date().toISOString(),
  };
  await save(record);
  json(res, 201, publicRecord(record));
}

async function uploadFile(req, res, record, kind) {
  if (record.status === 'registered') throw new UploadError(409, 'This song is already registered.');
  if (limited(req, 'file', 40, 60 * 60 * 1000)) throw new UploadError(429, 'Too many uploads from this network. Try again later.');
  const buffer = await readBody(req, LIMITS[kind]);
  const info = validateFile(kind, buffer);
  const key = `${prefix}/${record.id}/${kind}.${info.ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: buffer, ContentType: info.type,
    ServerSideEncryption: 'AES256', ChecksumAlgorithm: 'SHA256',
    Metadata: { 'upload-id': record.id, sha256: info.sha256 },
  }));
  record[kind] = { key, type: info.type, size: info.size, sha256: info.sha256 };
  if (record.audio && record.artwork && record.status === 'draft') record.status = 'uploaded';
  await save(record);
  json(res, 200, publicRecord(record));
}

/** Finds the SongRegistered event for this upload in the artist's transaction. */
async function verifyRegistration(record, txHash) {
  const receipt = await arc.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) throw new UploadError(404, 'Arc has not confirmed this transaction yet. Try again in a few seconds.');
  if (receipt.status !== 'success') throw new UploadError(400, 'This transaction failed on Arc.');
  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, CONTRACT)) continue;
    let event;
    try { event = decodeEventLog({ abi: soundBeatsEvents, data: log.data, topics: log.topics }); } catch { continue; }
    if (event.eventName !== 'SongRegistered') continue;
    const meta = parseSongMeta(event.args.metadataURI);
    if (meta?.uploadId !== record.id) continue;
    if (!isAddressEqual(event.args.artist, record.wallet)) throw new UploadError(403, 'The song was registered by a different wallet.');
    return { songId: Number(event.args.songId), txHash, blockNumber: Number(receipt.blockNumber), artist: getAddress(event.args.artist), metadataURI: event.args.metadataURI };
  }
  throw new UploadError(400, 'This transaction did not register this upload.');
}

async function finalize(req, res, record) {
  const body = await readJson(req);
  if (!record.arc) {
    if (!record.audio || !record.artwork) throw new UploadError(409, 'Upload the song and artwork first.');
    if (!isTxHash(body.txHash)) throw new UploadError(400, 'Missing the Arc transaction hash.');
    record.arc = await verifyRegistration(record, body.txHash);
    record.status = 'registered';
    await save(record);
  }
  if (!record.arkiv && arkivConfigured()) {
    try {
      record.arkiv = await publishArtistSong({
        uploadId: record.id, arcSongId: String(record.arc.songId), artist: record.arc.artist,
        title: record.title, artistName: record.artistName, genre: record.genre,
        audioKey: record.audio.key, artworkKey: record.artwork.key,
        audioSha256: record.audio.sha256, artworkSha256: record.artwork.sha256,
        audioUrl: `${publicBase}/api/media/${record.id}/audio`, artworkUrl: `${publicBase}/api/media/${record.id}/artwork`,
        arcChainId: arcTestnet.id, arcContract: CONTRACT, arcTxHash: record.arc.txHash,
        bucket, createdAt: record.createdAt,
      });
      record.arkivError = null;
    } catch (error) {
      console.error('arkiv publish failed', error);
      record.arkivError = 'Saving to Arkiv failed. Try again.';
    }
    await save(record);
  } else if (!record.arkiv) {
    record.arkivError = 'Arkiv is not configured on the server.';
    await save(record);
  }
  json(res, 200, publicRecord(record));
}

async function media(res, record, kind) {
  const file = record[kind];
  if (!file) throw new UploadError(404, 'Not found.');
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: file.key }), { expiresIn: 3600 });
  res.writeHead(302, { Location: url, 'Cache-Control': 'private, max-age=1800' });
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['api', ...]
    if (parts[0] !== 'api') throw new UploadError(404, 'Not found.');
    const [, area, id, action] = parts;

    if (area === 'health' && req.method === 'GET') return json(res, 200, { ok: true, arkiv: arkivConfigured(), bucket, contract: CONTRACT });

    if (area === 'uploads') {
      if (!id && req.method === 'POST') return await createDraft(req, res);
      if (!id && req.method === 'GET') {
        const artist = url.searchParams.get('artist');
        if (!isAddress(artist)) throw new UploadError(400, 'Pass ?artist=<wallet>.');
        const list = [...records.values()].filter(r => r.arc && isAddressEqual(r.wallet, artist)).map(publicRecord).reverse();
        return json(res, 200, { uploads: list });
      }
      if (!isUploadId(id)) throw new UploadError(404, 'Upload not found.');
      const record = records.get(id);
      if (!record) throw new UploadError(404, 'Upload not found.');
      if (!action && req.method === 'GET') return json(res, 200, publicRecord(record));
      if ((action === 'audio' || action === 'artwork') && req.method === 'PUT') return await uploadFile(req, res, record, action);
      if (action === 'finalize' && req.method === 'POST') return await finalize(req, res, record);
    }

    if (area === 'media' && req.method === 'GET' && isUploadId(id) && (action === 'audio' || action === 'artwork')) {
      const record = records.get(id);
      if (!record) throw new UploadError(404, 'Not found.');
      return await media(res, record, action);
    }
    throw new UploadError(404, 'Not found.');
  } catch (error) {
    if (error instanceof UploadError) return json(res, error.status, { error: error.message });
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Something went wrong on the server. Try again.' });
  }
});

server.requestTimeout = 120_000;
server.listen(port, '127.0.0.1', () => console.log(`SoundBeats releases API on http://127.0.0.1:${port} (bucket ${bucket}, arkiv ${arkivConfigured() ? 'on' : 'off'})`));
