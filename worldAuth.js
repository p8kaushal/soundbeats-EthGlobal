import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuer = process.env.WORLD_ISSUER || 'https://auth.world.org';
const clientId = process.env.WORLD_CLIENT_ID || '57dbfe35-6a2b-478e-ac11-1d2f4230750d';
const redirectUri = process.env.WORLD_REDIRECT_URI || 'https://ethglobal.soundbeats.io/api/auth/world/callback';
const sessions = new Map();
const ttlMs = 10 * 60 * 1000;
let discoveryPromise;
setInterval(() => { const cutoff = Date.now() - 24 * 60 * 60 * 1000; for (const [id, session] of sessions) if (session.createdAt < cutoff) sessions.delete(id); }, 60 * 60 * 1000).unref();

const base64url = value => Buffer.from(value).toString('base64url');
const sha256 = value => createHash('sha256').update(value).digest();
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).map(v => { const at = v.indexOf('='); return [v.slice(0, at), decodeURIComponent(v.slice(at + 1))]; }));

export function worldConfigured() { return Boolean(clientId && process.env.WORLD_CLIENT_SECRET); }

export function sessionFor(req, res) {
  let id = cookies(req).sb_session;
  if (!id || !sessions.has(id)) {
    id = randomUUID();
    sessions.set(id, { id, createdAt: Date.now() });
    const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', `sb_session=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? '; Secure' : ''}`);
  }
  return sessions.get(id);
}

// A restart clears in-memory sessions. Restore only the creator's existing random
// cookie for a recently created track; World verification is deliberately not restored.
export function restoreTrackSession(req, record) {
  const id = cookies(req).sb_session;
  const createdAt = Date.parse(record.createdAt);
  const now = Date.now();
  if (!id || id !== record.sessionId || !Number.isFinite(createdAt) || createdAt > now || now - createdAt >= 24 * 60 * 60 * 1000) return false;
  if (!sessions.has(id)) sessions.set(id, { id, createdAt });
  return true;
}

async function discovery() {
  if (!discoveryPromise) discoveryPromise = fetch(`${issuer}/.well-known/openid-configuration`).then(async response => {
    if (!response.ok) throw new Error('World authentication discovery failed.');
    return response.json();
  });
  return discoveryPromise;
}

export async function beginWorldAuth(req, res) {
  if (!worldConfigured()) throw new Error('World authentication is not configured.');
  const session = sessionFor(req, res);
  const config = await discovery();
  const verifier = base64url(randomBytes(48));
  const state = base64url(randomBytes(32));
  const nonce = base64url(randomBytes(32));
  session.pending = { verifier, state, nonce, expiresAt: Date.now() + ttlMs };
  const url = new URL(config.authorization_endpoint);
  for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid', state, nonce, code_challenge: base64url(sha256(verifier)), code_challenge_method: 'S256', prompt: 'consent' })) url.searchParams.set(key, value);
  return url.toString();
}

export async function finishWorldAuth(req, res, url) {
  const session = sessionFor(req, res);
  const pending = session.pending;
  delete session.pending;
  if (url.searchParams.get('error')) throw new Error('World verification was cancelled or denied.');
  if (url.searchParams.get('iss') && url.searchParams.get('iss') !== issuer) throw new Error('World returned an unexpected issuer.');
  if (!pending || pending.expiresAt < Date.now() || url.searchParams.get('state') !== pending.state) throw new Error('World verification expired or did not match this browser.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('World did not return an authorization code.');
  const config = await discovery();
  const credentials = Buffer.from(`${clientId}:${process.env.WORLD_CLIENT_SECRET}`).toString('base64');
  const tokenResponse = await fetch(config.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${credentials}` }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: pending.verifier }) });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.id_token) throw new Error('World could not validate this verification.');
  const jwks = createRemoteJWKSet(new URL(config.jwks_uri));
  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer, audience: clientId });
  if (payload.nonce !== pending.nonce || !payload.sub) throw new Error('World returned an invalid identity result.');
  session.world = { subject: payload.sub, verifiedAt: Date.now(), expiresAt: Date.now() + ttlMs, available: true, acr: payload.acr || null };
}

export function worldStatus(session) {
  const verified = Boolean(session.world?.available && session.world.expiresAt > Date.now());
  return { configured: worldConfigured(), verified, expiresAt: verified ? new Date(session.world.expiresAt).toISOString() : null };
}

export function consumeWorldVerification(session) {
  if (!session.world?.available || session.world.expiresAt <= Date.now()) return false;
  session.world.available = false;
  return true;
}
