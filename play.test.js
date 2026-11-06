import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// "Play in SoundBeats" links, using mock beatmaps (no private engine needed).
const port = 31989, base = `http://127.0.0.1:${port}`, publicUrl = 'https://play.example.test';
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '', BEATMAP_ENGINE_URL: '', BEATMAP_ENGINE_MOCK: '1', PUBLIC_BASE_URL: publicUrl, TESTFLIGHT_URL: 'https://testflight.apple.com/join/TEST1234' }, stdio: 'ignore' });
after(() => server.kill());
async function ready() { for (let i = 0; i < 50; i++) { try { await fetch(base); return; } catch { await sleep(100); } } throw new Error('Server did not start'); }

test('play link, package, page and QR', async () => {
  await ready();
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  let track = await (await fetch(`${base}/api/tracks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageBase64: png.toString('base64'), demo: true }) })).json();
  for (let i = 0; i < 30 && track.status === 'processing'; i++) { await sleep(100); track = await (await fetch(`${base}/api/tracks/${track.id}`)).json(); }
  assert.equal(track.status, 'completed');

  // No beatmap yet
  assert.equal((await fetch(`${base}/api/tracks/${track.id}/play-link`)).status, 404);
  assert.equal((await fetch(`${base}/api/tracks/${track.id}/play-link?difficulty=11`)).status, 400);

  // Photo is stored and served
  const img = await fetch(`${base}/api/tracks/${track.id}/image`);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), png);

  assert.equal((await fetch(`${base}/api/tracks/${track.id}/beatmap?difficulty=6`, { method: 'POST' })).status, 200);

  const link = await (await fetch(`${base}/api/tracks/${track.id}/play-link`)).json(); // latest difficulty
  assert.equal(link.difficulty, 6);
  assert.equal(link.packageUrl, `${publicUrl}/api/play/${track.id}/6.json`);
  assert.equal(link.playPageUrl, `${publicUrl}/play/${track.id}?difficulty=6`);
  assert.equal(link.deepLink, `soundbeats://play?pkg=${encodeURIComponent(link.packageUrl)}`);
  assert.equal(link.reachableFromPhone, true);
  assert.equal(link.testflightUrl, 'https://testflight.apple.com/join/TEST1234');
  assert.equal((await fetch(`${base}/api/tracks/${track.id}/play-link?difficulty=3`)).status, 404);

  const pkgRes = await fetch(`${base}/api/play/${track.id}/6.json`);
  assert.equal(pkgRes.status, 200); assert.equal(pkgRes.headers.get('access-control-allow-origin'), '*');
  const pkg = await pkgRes.json();
  assert.equal(pkg.version, 2); assert.ok(pkg.beats.length > 0);
  assert.equal(pkg.source.mubertS3url, `${publicUrl}/api/tracks/${track.id}/audio`);
  assert.equal(pkg.source.guid, track.id);
  assert.equal(pkg.imageUrl, `${publicUrl}/api/tracks/${track.id}/image`);
  assert.ok(pkg.title && pkg.artist);

  const page = await fetch(`${base}/play/${track.id}?difficulty=6`);
  assert.equal(page.status, 200); const html = await page.text();
  assert.match(html, /Play in SoundBeats/); assert.ok(html.includes(link.deepLink.replace(/&/g, '&amp;'))); assert.match(html, /testflight\.apple\.com/); assert.match(html, /<svg/);

  const qr = await fetch(`${base}/api/tracks/${track.id}/play-qr.svg?difficulty=6`);
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml'); assert.match(await qr.text(), /^<svg/);
});
