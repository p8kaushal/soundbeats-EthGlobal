import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey } from 'viem/accounts';
process.env.ARC_PUBLISHER_KEY = generatePrivateKey(); // random throwaway key for signing tests
const { signAccess, verifyAccess, arcPublicInfo, arcPayoutWallet, arcPriceUnits, publishOnArc } = await import('./arcClient.js');
const { playLinks, playPage } = await import('./playLink.js');
const id = '11111111-2222-4333-8444-555555555555', w = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

test('defaults: 1.5 USDC paid to the SoundBeats wallet', () => {
  assert.equal(arcPriceUnits(), 1_500_000n);
  assert.equal(arcPayoutWallet(), '0xE4bd45C71e54f851d0c0349339B2aEDA551b7f49');
});
test('signed access is bound to track, difficulty and wallet', () => {
  const sig = signAccess(id, 5, w);
  assert.ok(verifyAccess(id, 5, w, sig));
  assert.ok(verifyAccess(id, 5, w.toLowerCase(), sig));
  assert.ok(!verifyAccess(id, 6, w, sig));
  assert.ok(!verifyAccess(id, 5, '0x90F79bf6EB2c4f870365E785982E1f101E93b906', sig));
  assert.ok(!verifyAccess(id, 5, w, 'x'.repeat(32)));
  assert.ok(!verifyAccess(id, 5, 'not-a-wallet', sig));
});
test('paid links carry the signature into the game package URL', () => {
  const links = playLinks('https://ethglobal.soundbeats.io/game', { id }, 5, { wallet: w, sig: 'abc' });
  assert.equal(links.packageUrl, `https://ethglobal.soundbeats.io/game/api/play/${id}/5.json?w=${w}&s=abc`);
  assert.ok(decodeURIComponent(links.deepLink.split('pkg=')[1]) === links.packageUrl);
});
test('paywall page hides the game link until paid', async () => {
  const links = playLinks('https://ethglobal.soundbeats.io/game', { id }, 5);
  const html = await playPage(links, { title: 'T', artist: 'A', beats: [] }, { ...arcPublicInfo({ releaseId: 82, price: 1500000 }), unlockUrl: 'u' });
  assert.ok(html.includes('Unlock with MetaMask') && html.includes('1.5 USDC'));
  assert.ok(!html.includes(`href="${links.deepLink}"`));
});
test('retry reuses a completed Arc listing without a new transaction', async () => {
  const progress = { songId: '4', releaseId: '9', price: '1500000', complete: true, txs: { registerSong: 'existing', publishRelease: 'existing', artistWallet: 'existing', creatorWallet: 'existing' } };
  let saved;
  const result = await publishOnArc({ title: 'Test', metadataURI: 'https://example.test', beatmapId: 'test', difficulty: 5, progress, onProgress: async value => { saved = value; } });
  assert.equal(result.releaseId, '9');
  assert.equal(saved.txs.publishRelease, 'existing');
});
