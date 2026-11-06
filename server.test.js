import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const port = 31987, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' }, stdio: 'ignore' });
after(() => server.kill());
async function ready() { for (let i=0;i<50;i++) { try { await fetch(base); return; } catch { await sleep(100); } } throw new Error('Server did not start'); }
const send = value => fetch(`${base}/api/tracks`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(value) });
test('demo track API and validation', async () => {
 await ready();
 let res = await send({ imageBase64: Buffer.from('bad').toString('base64'), demo:true }); assert.equal(res.status, 400);
 const imageBase64 = Buffer.from('89504e470d0a1a0a00000000','hex').toString('base64');
 res = await send({ imageBase64 }); assert.equal(res.status, 503);
 res = await fetch(`${base}/api/auth/world/status`); assert.equal(res.status, 200); assert.equal((await res.json()).verified, false);
 res = await send({ imageBase64, prompt:'x'.repeat(501), demo:true }); assert.equal(res.status, 400);
 res = await send({ imageBase64, demo:true }); assert.equal(res.status, 202); let track = await res.json();
 const sessionCookie = res.headers.get('set-cookie').split(';')[0];
 for (let i=0;i<30 && track.status === 'processing';i++) { await sleep(100); track = await (await fetch(`${base}/api/tracks/${track.id}`)).json(); }
 assert.equal(track.status, 'completed'); assert.equal(track.source, 'demo'); assert.equal(track.durationSeconds, 8);
 res = await fetch(base + track.audioUrl); assert.equal(res.headers.get('content-type'), 'audio/wav'); const wav = Buffer.from(await res.arrayBuffer()); assert.equal(wav.toString('ascii',0,4), 'RIFF'); assert.equal(wav.toString('ascii',8,12), 'WAVE'); assert.equal(wav.readUInt32LE(40), wav.length - 44);
 res = await fetch(base + track.audioUrl, { headers: { Range: 'bytes=100-199' } }); assert.equal(res.status, 206); assert.equal(res.headers.get('accept-ranges'), 'bytes'); assert.equal(res.headers.get('content-range'), `bytes 100-199/${wav.length}`); assert.deepEqual(Buffer.from(await res.arrayBuffer()), wav.subarray(100, 200));
 res = await fetch(base + track.audioUrl, { headers: { Range: 'bytes=-64' } }); assert.equal(res.status, 206); assert.deepEqual(Buffer.from(await res.arrayBuffer()), wav.subarray(-64));
 res = await fetch(base + track.audioUrl, { headers: { Range: `bytes=${wav.length}-` } }); assert.equal(res.status, 416);
 assert.equal((await fetch(`${base}/api/tracks/00000000-0000-0000-0000-000000000000`)).status, 404);
 res = await fetch(`${base}/api/tracks/${track.id}/publish`, { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Demo', creator: 'Test' }) }); assert.equal(res.status, 409);
});
