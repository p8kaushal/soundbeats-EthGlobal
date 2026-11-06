// Pure helpers for validating artist uploads. No network access here so they are easy to test.
import { createHash } from 'node:crypto';

export const LIMITS = { audio: 25 * 1024 * 1024, artwork: 5 * 1024 * 1024 };

/** Detects MP3 (ID3 tag or MPEG frame sync), JPEG, PNG and WebP from the first bytes. */
export function sniff(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return { kind: 'audio', type: 'audio/mpeg', ext: 'mp3' };
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return { kind: 'audio', type: 'audio/mpeg', ext: 'mp3' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { kind: 'artwork', type: 'image/jpeg', ext: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'artwork', type: 'image/png', ext: 'png' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { kind: 'artwork', type: 'image/webp', ext: 'webp' };
  return null;
}

/** Returns the detected file info, or throws a message that is safe to show the artist. */
export function validateFile(kind, buffer) {
  if (!LIMITS[kind]) throw new UploadError(400, 'Unknown file kind.');
  if (buffer.length === 0) throw new UploadError(400, 'The file is empty.');
  if (buffer.length > LIMITS[kind]) throw new UploadError(413, `The file is larger than ${LIMITS[kind] / 1024 / 1024} MB.`);
  const info = sniff(buffer);
  if (!info || info.kind !== kind) throw new UploadError(415, kind === 'audio' ? 'Upload an MP3 file.' : 'Upload a JPG, PNG or WebP image.');
  return { ...info, size: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
}

export function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

export const isAddress = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
export const isUploadId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const isTxHash = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

/** Song metadata is a data:application/json URI; returns the parsed object or null. */
export function parseSongMeta(uri) {
  const prefix = 'data:application/json,';
  if (typeof uri !== 'string' || !uri.startsWith(prefix)) return null;
  try { const parsed = JSON.parse(decodeURIComponent(uri.slice(prefix.length))); return parsed && typeof parsed === 'object' ? parsed : null; } catch { return null; }
}

export class UploadError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
