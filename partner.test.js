import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 31989, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), GEMINI_API_KEY: 'configured-for-gate-test', WORLD_CLIENT_SECRET: 'test-only-secret', ARKIV_PRIVATE_KEY: '', ARKIV_ACCESS_KEY: '', ARC_PUBLISHER_KEY: '' }, stdio: 'ignore' });
after(() => server.kill());
async function ready() { for (let i = 0; i < 50; i++) { try { await fetch(base); return; } catch { await sleep(100); } } throw new Error('Server did not start'); }

test('when World is configured, live generation requires it and secrets stay server-side', async () => {
  await ready();
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.worldConfigured, true);
  assert.equal(config.arcConfigured, false);
  assert.equal(config.arkivConfigured, false);
  assert.ok(!JSON.stringify(config).includes('test-only-secret'));
  const imageBase64 = Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64');
  const response = await fetch(`${base}/api/tracks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageBase64, demo: false }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).verificationRequired, true);
});
