import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { custom, hexToString, stringToHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Tracks, trackValues } from './arkivClient.js';

const metadata = { trackId: 'test-track', source: 'lyria', beatmapSource: 'engine', difficulty: 5, title: 'Test', creator: 'Tester', audioUrl: 'https://example.test/audio', beatmapUrl: 'https://example.test/map', arc: { releaseId: '12' } };
const client = createWalletClient({ chain: rabdi({ accessKey: 'test-only' }), account: privateKeyToAccount(generatePrivateKey()), transport: custom({ request: async () => { throw new Error('test RPC reached'); } }, { retryCount: 0 }) });
const create = values => client.createEntity(Tracks, values, { expiration: ExpirationTime.fromDays(180) });

test('metadata round-trips as bytes and passes the SDK schema encoder', async () => {
  const values = trackValues(metadata);
  assert.equal(values.metadata.type, 'bytes');
  assert.deepEqual(JSON.parse(hexToString(values.metadata.value)), metadata);
  await assert.rejects(create(values), /test RPC reached/);
});

test('the previous plain hex string is rejected before network submission', async () => {
  const values = { ...trackValues(metadata), metadata: stringToHex(JSON.stringify(metadata)) };
  await assert.rejects(create(values), error => ['SchemaMismatchError', 'InvalidValueError'].includes(error.name));
});
