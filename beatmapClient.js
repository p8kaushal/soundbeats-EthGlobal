// Client for the SoundBeats beatmap engine.
//
// The engine itself is proprietary and is NOT part of this repository. It runs as a separate
// private service; this module only sends it an audio file and receives a v2 beatmap JSON.
//
//   BEATMAP_ENGINE_URL    e.g. http://127.0.0.1:4100 (on the server, or through an SSH tunnel)
//   BEATMAP_ENGINE_TOKEN  shared secret, sent as "Authorization: Bearer <token>"
//   BEATMAP_ENGINE_MOCK=1 optional: return a simple placeholder chart (for UI work without the engine)

export const beatmapEngineConfigured = () =>
  Boolean(process.env.BEATMAP_ENGINE_URL) || process.env.BEATMAP_ENGINE_MOCK === '1';

export async function generateBeatmap({ audio, mimeType = 'audio/mpeg', difficulty = 5, title = '', artist = '', guid = '', timeoutMs = 60000 }) {
  if (process.env.BEATMAP_ENGINE_MOCK === '1' && !process.env.BEATMAP_ENGINE_URL) return mockBeatmap({ audio, difficulty, title, artist, guid });

  const base = process.env.BEATMAP_ENGINE_URL;
  if (!base) throw new Error('Beatmap engine is not configured. Set BEATMAP_ENGINE_URL and BEATMAP_ENGINE_TOKEN.');
  const url = new URL('/v1/beatmaps', base);
  url.search = new URLSearchParams({ difficulty: String(difficulty), title, artist, guid }).toString();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, Authorization: `Bearer ${process.env.BEATMAP_ENGINE_TOKEN || ''}` },
      body: audio,
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Beatmap engine timed out.' : `Could not reach the beatmap engine (${e.cause?.code || e.message}).`);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ? `Beatmap engine: ${body.error}` : `Beatmap engine returned HTTP ${res.status}.`);
  return { ...body, source: 'engine' }; // { beatmap, info, source }
}

// Placeholder chart for UI development only: evenly spaced notes at 120 BPM. It does not follow
// the music and is clearly labelled as a mock. Duration is estimated from the file size.
function mockBeatmap({ audio, difficulty, title, artist, guid }) {
  const seconds = Math.max(8, Math.min(240, audio.length / 24000));
  const step = [2, 1.5, 1.25, 1, 0.875, 0.75, 0.625, 0.5, 0.45, 0.4][difficulty - 1] || 1;
  const beats = [];
  for (let t = 1, i = 0; t < seconds - 1; t += step, i++) {
    const type = i % 8 === 7 ? 1 : 0;
    beats.push({ t: +t.toFixed(3), x: [0.3, 0.5, 0.7, 0.5][i % 4], type, hold: 0, width: type === 0 ? 0.4 : 0.8 });
  }
  return {
    beatmap: { version: 2, startTime: 0, beats, title, artist, imageUrl: '', source: { audiusId: '', mubertS3url: '', guid } },
    info: { mock: true, difficulty, bpm: 120, durationSeconds: +seconds.toFixed(1), stats: { notes: beats.length }, warnings: ['Mock chart: placeholder notes, not generated from the music.'] },
    source: 'mock',
  };
}
