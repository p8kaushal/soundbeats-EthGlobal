import test from 'node:test';
import assert from 'node:assert/strict';
import { sniff, validateFile, parseSongMeta, isUploadId, cleanText } from '../media.js';

test('detects mp3 and images', () => {
  assert.equal(sniff(Buffer.from('ID3\x04\x00', 'binary')).kind, 'audio');
  assert.equal(sniff(Buffer.from([0xff, 0xfb, 0x90, 0x00])).kind, 'audio');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).type, 'image/jpeg');
  assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).type, 'image/png');
  assert.equal(sniff(Buffer.from('hello world')), null);
});
test('rejects wrong kinds, empty and oversize files', () => {
  assert.throws(() => validateFile('audio', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), /MP3/);
  assert.throws(() => validateFile('artwork', Buffer.alloc(0)), /empty/);
  assert.throws(() => validateFile('artwork', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(6 * 1024 * 1024)])), /larger/);
  const ok = validateFile('audio', Buffer.from('ID3\x04\x00abc', 'binary'));
  assert.equal(ok.ext, 'mp3'); assert.equal(ok.sha256.length, 64);
});
test('parses song metadata uri', () => {
  const uri = 'data:application/json,' + encodeURIComponent(JSON.stringify({ uploadId: 'x', cover: 'https://a' }));
  assert.equal(parseSongMeta(uri).uploadId, 'x');
  assert.equal(parseSongMeta('https://nope'), null);
  assert.equal(parseSongMeta('data:application/json,%7Bbad'), null);
});
test('ids and text', () => {
  assert.ok(isUploadId('3f2b8c1e-1234-4abc-8def-0123456789ab'));
  assert.ok(!isUploadId('../../etc/passwd'));
  assert.equal(cleanText('  hi\u0000there  ', 100), 'hithere');
});
