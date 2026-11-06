import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { restoreTrackSession, sessionFor } from './worldAuth.js';

test('recent creator session can be restored after restart without restoring World verification', () => {
  const id = randomUUID(), record = { sessionId: id, createdAt: new Date().toISOString() };
  const req = { headers: { cookie: `sb_session=${id}` } };
  assert.equal(restoreTrackSession(req, record), true);
  const session = sessionFor(req, { setHeader() { throw new Error('A new cookie must not be issued'); } });
  assert.equal(session.id, id);
  assert.equal(session.world, undefined);
});

test('different, expired, or future-dated track cookies cannot be restored', () => {
  const id = randomUUID(), req = { headers: { cookie: `sb_session=${id}` } };
  assert.equal(restoreTrackSession(req, { sessionId: randomUUID(), createdAt: new Date().toISOString() }), false);
  assert.equal(restoreTrackSession(req, { sessionId: id, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }), false);
  assert.equal(restoreTrackSession(req, { sessionId: id, createdAt: new Date(Date.now() + 60_000).toISOString() }), false);
});

test('publish recognizes the original browser after a server restart', async () => {
  const port = 31972, base = `http://127.0.0.1:${port}`;
  const launch = () => spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '', WORLD_CLIENT_SECRET: '' }, stdio: 'ignore' });
  const ready = async () => { for (let i = 0; i < 50; i++) { try { await fetch(`${base}/api/config`); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } } throw new Error('server did not start'); };
  let app = launch();
  try {
    await ready();
    const response = await fetch(`${base}/api/tracks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageBase64: 'iVBORw0KGgoAAAANSUhEUg==', demo: true }) });
    assert.equal(response.status, 202);
    const cookie = response.headers.get('set-cookie').split(';')[0], track = await response.json();
    app.kill(); await new Promise(resolve => app.once('exit', resolve));
    app = launch(); await ready();
    const post = cookieValue => fetch(`${base}/api/tracks/${track.id}/publish`, { method: 'POST', headers: { cookie: cookieValue, 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await post(`sb_session=${randomUUID()}`)).status, 403);
    assert.equal((await post(cookie)).status, 409); // recognized as creator; demo cannot be published
  } finally { app.kill(); }
});
