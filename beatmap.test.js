import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// Uses BEATMAP_ENGINE_MOCK so the test runs without the private engine.
const port = 31988, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '', BEATMAP_ENGINE_URL: '', BEATMAP_ENGINE_MOCK: '1' }, stdio: 'ignore' });
after(() => server.kill());
async function ready() { for (let i = 0; i < 50; i++) { try { await fetch(base); return; } catch { await sleep(100); } } throw new Error('Server did not start'); }

test('beatmap endpoint: validation, generation and download', async () => {
  await ready();
  const imageBase64 = Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64');
  let track = await (await fetch(`${base}/api/tracks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageBase64, demo: true }) })).json();
  for (let i = 0; i < 30 && track.status === 'processing'; i++) { await sleep(100); track = await (await fetch(`${base}/api/tracks/${track.id}`)).json(); }
  assert.equal(track.status, 'completed');

  const url = `${base}/api/tracks/${track.id}/beatmap`;
  assert.equal((await fetch(`${url}?difficulty=0`, { method: 'POST' })).status, 400);
  assert.equal((await fetch(`${url}?difficulty=4`)).status, 404); // not generated yet
  assert.equal((await fetch(`${base}/api/tracks/00000000-0000-0000-0000-000000000000/beatmap`, { method: 'POST' })).status, 404);

  const res = await fetch(`${url}?difficulty=4`, { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, 'mock');
  assert.equal(body.beatmap.version, 2);
  assert.ok(body.beatmap.beats.length > 0);
  for (const b of body.beatmap.beats) for (const k of ['t', 'x', 'type', 'hold', 'width']) assert.equal(typeof b[k], 'number');

  const dl = await fetch(base + body.beatmapUrl);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(await dl.json(), body.beatmap);

  track = await (await fetch(`${base}/api/tracks/${track.id}`)).json();
  assert.equal(track.beatmaps['4'].source, 'mock');
});
