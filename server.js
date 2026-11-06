import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { generateMusic } from './provider.js';
import { generateBeatmap, beatmapEngineConfigured } from './beatmapClient.js';
import { publicBase, pickDifficulty, playLinks, playPackage, playPage, qrSvg } from './playLink.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = path.join(root, 'data');
await mkdir(data, { recursive: true });
const port = Number(process.env.PORT || 3000);
// Optional sub-path when served behind nginx, e.g. BASE_PATH=/game -> https://ethglobal.soundbeats.io/game/
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const maxBytes = 5 * 1024 * 1024;
const records = new Map();
for (const file of await readdir(data)) if (file.endsWith('.json')) {
  try { const record = JSON.parse(await readFile(path.join(data, file), 'utf8')); if (record.status === 'processing') { record.status = 'failed'; record.error = 'Server restarted during generation. Please try again.'; await writeFile(path.join(data, file), JSON.stringify(record)); } records.set(record.id, record); } catch { /* ignore incomplete records */ }
}
const save = async record => { records.set(record.id, record); await writeFile(path.join(data, `${record.id}.json`), JSON.stringify(record)); };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
function demoWav() {
  const rate = 22050, seconds = 8, samples = rate * seconds, b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  const notes = [220, 277.18, 329.63, 440, 329.63, 277.18, 246.94, 329.63];
  for (let i = 0; i < samples; i++) { const t = i / rate, beat = t % .25, env = Math.exp(-beat * 8), kick = Math.sin(2 * Math.PI * (65 * t - 22 * (t % .5) ** 2)) * Math.exp(-(t % .5) * 16); const tone = Math.sin(2 * Math.PI * notes[Math.floor(t * 4) % notes.length] * t); const fade = Math.min(1, t * 4, (seconds - t) * 4); b.writeInt16LE(Math.round((tone * env * .26 + kick * .24) * fade * 32767), 44 + i * 2); }
  return b;
}
async function body(req) { let size = 0, chunks = []; for await (const chunk of req) { size += chunk.length; if (size > 7 * 1024 * 1024) throw new Error('Request too large. Maximum image size is 5 MB.'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString()); }
function imageType(b) { if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg'; if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'image/png'; if (b.length > 12 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') return 'image/webp'; return null; }
async function run(record, image, mimeType, prompt, demo) {
  const started = Date.now();
  try {
    const result = demo ? { bytes: demoWav(), format: 'wav', mimeType: 'audio/wav', durationSeconds: 8 } : await generateMusic({ image, mimeType, prompt, apiKey: process.env.GEMINI_API_KEY });
    await writeFile(path.join(data, `${record.id}.${result.format}`), result.bytes);
    Object.assign(record, { status: 'completed', format: result.format, mimeType: result.mimeType, durationSeconds: result.durationSeconds, audioUrl: `/api/tracks/${record.id}/audio`, generationTimeMs: Date.now() - started });
  } catch (error) { Object.assign(record, { status: 'failed', error: error.message || 'Generation failed.', generationTimeMs: Date.now() - started }); }
  await save(record);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (basePath) {
      if (url.pathname === basePath) { res.writeHead(301, { Location: basePath + '/' + url.search }); return res.end(); }
      if (url.pathname.startsWith(basePath + '/')) url.pathname = url.pathname.slice(basePath.length);
    }
    if (req.method === 'POST' && url.pathname === '/api/tracks') {
      let input; try { input = await body(req); } catch (e) { return json(res, 400, { error: e instanceof SyntaxError ? 'Invalid JSON.' : e.message }); }
      if (typeof input.imageBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64)) return json(res, 400, { error: 'Provide a base64-encoded JPEG, PNG, or WebP image.' });
      const image = Buffer.from(input.imageBase64, 'base64'), mimeType = imageType(image);
      if (image.length > maxBytes) return json(res, 413, { error: 'Image exceeds the 5 MB limit.' });
      if (!mimeType) return json(res, 400, { error: 'Unsupported image. Use JPEG, PNG, or WebP.' });
      if (input.prompt !== undefined && (typeof input.prompt !== 'string' || input.prompt.length > 500)) return json(res, 400, { error: 'Prompt must be text up to 500 characters.' });
      if (input.demo !== undefined && typeof input.demo !== 'boolean') return json(res, 400, { error: 'Demo must be a boolean.' });
      const demo = input.demo === true;
      if (!demo && !process.env.GEMINI_API_KEY) return json(res, 503, { error: 'Live generation needs GEMINI_API_KEY. Use the demo track or configure the key.' });
      const record = { id: randomUUID(), status: 'processing', source: demo ? 'demo' : 'lyria', createdAt: new Date().toISOString(), audioUrl: null, format: null, mimeType: null, durationSeconds: null };
      const imageFormat = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
      await writeFile(path.join(data, `${record.id}.image.${imageFormat}`), image);
      Object.assign(record, { imageFormat, imageMimeType: mimeType });
      await save(record); run(record, image, mimeType, input.prompt || '', demo).catch(console.error); return json(res, 202, record);
    }
    const beatmapMatch = url.pathname.match(/^\/api\/tracks\/([0-9a-f-]{36})\/beatmap$/);
    if (beatmapMatch && (req.method === 'POST' || req.method === 'GET')) {
      const record = records.get(beatmapMatch[1]);
      if (!record) return json(res, 404, { error: 'Track not found.' });
      if (record.status !== 'completed') return json(res, 409, { error: 'Audio is not ready.' });
      const difficulty = Number(url.searchParams.get('difficulty') || 5);
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) return json(res, 400, { error: 'Difficulty must be a whole number from 1 to 10.' });
      const file = path.join(data, `${record.id}.beatmap-d${difficulty}.json`);
      if (req.method === 'GET') {
        try { const saved = await readFile(file); res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="soundbeats-${record.id}-d${difficulty}.json"`, 'Cache-Control': 'no-store' }); return res.end(saved); }
        catch (e) { if (e.code === 'ENOENT') return json(res, 404, { error: 'Beatmap not generated yet. POST to this URL first.' }); throw e; }
      }
      if (!beatmapEngineConfigured()) return json(res, 503, { error: 'Beatmap engine is not configured. Set BEATMAP_ENGINE_URL and BEATMAP_ENGINE_TOKEN (or BEATMAP_ENGINE_MOCK=1 for a placeholder).' });
      try {
        const audio = await readFile(path.join(data, `${record.id}.${record.format}`));
        const result = await generateBeatmap({ audio, mimeType: record.mimeType, difficulty, title: 'Soundbeats Photo Track', guid: record.id });
        await writeFile(file, JSON.stringify(result.beatmap));
        record.beatmaps = { ...(record.beatmaps || {}), [difficulty]: { url: `/api/tracks/${record.id}/beatmap?difficulty=${difficulty}`, source: result.source, notes: result.beatmap.beats.length, bpm: result.info?.bpm ?? null, createdAt: new Date().toISOString() } };
        await save(record);
        return json(res, 200, { ...result, beatmapUrl: record.beatmaps[difficulty].url });
      } catch (e) { console.error(e); return json(res, 502, { error: e.message || 'Beatmap generation failed.' }); }
    }
    // ---- Play in SoundBeats (deep link into the game) ----
    const imageMatch = url.pathname.match(/^\/api\/tracks\/([0-9a-f-]{36})\/image$/);
    if (imageMatch && (req.method === 'GET' || req.method === 'HEAD')) {
      const record = records.get(imageMatch[1]);
      if (!record || !record.imageFormat) return json(res, 404, { error: 'Image not found.' });
      const bytes = await readFile(path.join(data, `${record.id}.image.${record.imageFormat}`));
      res.writeHead(200, { 'Content-Type': record.imageMimeType, 'Content-Length': bytes.length, 'Cache-Control': 'public, max-age=86400' });
      return req.method === 'HEAD' ? res.end() : res.end(bytes);
    }
    const linkMatch = url.pathname.match(/^\/api\/tracks\/([0-9a-f-]{36})\/(play-link|play-qr\.svg)$/);
    const pageMatch = url.pathname.match(/^\/play\/([0-9a-f-]{36})$/);
    const pkgMatch = url.pathname.match(/^\/api\/play\/([0-9a-f-]{36})\/(\d{1,2})\.json$/);
    if (req.method === 'GET' && (linkMatch || pageMatch || pkgMatch)) {
      const id = (linkMatch || pageMatch || pkgMatch)[1];
      const record = records.get(id);
      if (!record) return json(res, 404, { error: 'Track not found.' });
      const requested = pkgMatch ? pkgMatch[2] : url.searchParams.get('difficulty');
      if (requested != null && !/^(10|[1-9])$/.test(requested)) return json(res, 400, { error: 'Difficulty must be a whole number from 1 to 10.' });
      const difficulty = pickDifficulty(record, requested == null ? null : Number(requested));
      if (difficulty == null) return json(res, 404, { error: 'No beatmap for this track yet. POST /api/tracks/{id}/beatmap?difficulty=N first.' });
      const base = publicBase(req), links = playLinks(base, record, difficulty);
      if (linkMatch?.[2] === 'play-link') return json(res, 200, links);
      if (linkMatch) { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); return res.end(await qrSvg(links.playPageUrl)); }
      const beatmap = JSON.parse(await readFile(path.join(data, `${record.id}.beatmap-d${difficulty}.json`), 'utf8'));
      const pkg = playPackage(base, record, beatmap);
      if (pkgMatch) { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }); return res.end(JSON.stringify(pkg)); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(await playPage(links, pkg));
    }
    const match = url.pathname.match(/^\/api\/tracks\/([0-9a-f-]{36})(\/audio)?$/);
    if ((req.method === 'GET' || req.method === 'HEAD') && match) {
      const record = records.get(match[1]);
      if (!record) return json(res, 404, { error: 'Track not found.' });
      if (!match[2]) return json(res, 200, record);
      if (record.status !== 'completed') return json(res, 409, { error: 'Audio is not ready.' });
      const bytes = await readFile(path.join(data, `${record.id}.${record.format}`));
      const headers = { 'Content-Type': record.mimeType, 'Content-Disposition': `inline; filename="soundbeats-${record.id}.${record.format}"`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
      const range = req.headers.range;
      if (range) {
        const parsed = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start, end;
        if (parsed && (parsed[1] || parsed[2])) {
          if (!parsed[1]) { const suffix = Number(parsed[2]); start = Math.max(0, bytes.length - suffix); end = bytes.length - 1; }
          else { start = Number(parsed[1]); end = parsed[2] ? Number(parsed[2]) : bytes.length - 1; }
        }
        if (start === undefined || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= bytes.length || start > end || end < 0) {
          res.writeHead(416, { ...headers, 'Content-Range': `bytes */${bytes.length}` }); return res.end();
        }
        end = Math.min(end, bytes.length - 1);
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
        return req.method === 'HEAD' ? res.end() : res.end(bytes.subarray(start, end + 1));
      }
      res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
      return req.method === 'HEAD' ? res.end() : res.end(bytes);
    }
    if (req.method === 'GET' && (url.pathname === '/' || /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname))) {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream';
      try { const content = await readFile(path.join(root, 'dist', file)); res.writeHead(200, { 'Content-Type': type }); return res.end(content); }
      catch (error) { if (error.code === 'ENOENT') return json(res, 404, { error: 'Frontend build not found. Run npm run build or use npm run dev.' }); throw error; }
    }
    json(res, 404, { error: 'Not found.' });
  } catch (error) { console.error(error); if (!res.headersSent) json(res, 500, { error: 'Something went wrong on the server.' }); else res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Soundbeats Studio running at http://localhost:${port}`));
