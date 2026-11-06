// "Play in SoundBeats": turns a generated track + beatmap into a link that opens the game.
//
// Flow: web app / AI agent -> /play/{id}?difficulty=N (landing page with button + QR)
//       -> soundbeats://play?pkg=<package URL> (opens the iOS TestFlight build)
//       -> game fetches the play package (a normal v2 beatmap whose source.mubertS3url points
//          to the track audio and imageUrl to the user's photo) and starts the level.
//
//   PUBLIC_BASE_URL   public origin the phone can reach, e.g. https://ethglobal.soundbeats.io
//                     (defaults to the request's host; localhost links only work on this machine)
//   GAME_URL_SCHEME   app URL scheme, default "soundbeats"
//   TESTFLIGHT_URL    public TestFlight invite link shown when the game isn't installed
import QRCode from 'qrcode';

export function publicBase(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

export const isLocalBase = base => /^https?:\/\/(localhost|127\.|\[::1\])/i.test(base);

// Picks the requested difficulty, or the most recently generated one.
export function pickDifficulty(record, requested) {
  const available = Object.entries(record.beatmaps || {});
  if (!available.length) return null;
  if (requested != null) return record.beatmaps[requested] ? Number(requested) : null;
  available.sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
  return Number(available[0][0]);
}

export function playLinks(base, record, difficulty) {
  const scheme = process.env.GAME_URL_SCHEME || 'soundbeats';
  const packageUrl = `${base}/api/play/${record.id}/${difficulty}.json`;
  const playPageUrl = `${base}/play/${record.id}?difficulty=${difficulty}`;
  return {
    trackId: record.id,
    difficulty,
    playPageUrl,
    packageUrl,
    deepLink: `${scheme}://play?pkg=${encodeURIComponent(packageUrl)}`,
    qrSvgUrl: `${base}/api/tracks/${record.id}/play-qr.svg?difficulty=${difficulty}`,
    testflightUrl: process.env.TESTFLIGHT_URL || null,
    reachableFromPhone: !isLocalBase(base),
  };
}

export function playPackage(base, record, beatmap) {
  return {
    ...beatmap,
    version: 2,
    title: beatmap.title && beatmap.title !== 'Soundbeats Photo Track' ? beatmap.title : (record.title || 'My Photo Track'),
    artist: beatmap.artist || 'SoundBeats AI',
    imageUrl: record.imageFormat ? `${base}/api/tracks/${record.id}/image` : (beatmap.imageUrl || ''),
    source: {
      audiusId: '',
      mubertS3url: `${base}/api/tracks/${record.id}/audio`, // game plays audio from this URL
      guid: record.id,
    },
  };
}

export const qrSvg = text => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function playPage(links, pkg) {
  const qr = await qrSvg(links.playPageUrl);
  const notes = pkg.beats?.length || 0;
  const image = pkg.imageUrl ? `<img class="cover" src="${esc(pkg.imageUrl)}" alt="Track cover">` : '<div class="cover blank">♫</div>';
  const warn = links.reachableFromPhone ? '' : '<p class="warn">This link uses a local address, so a phone can\'t open it yet. Set PUBLIC_BASE_URL to the public HTTPS address.</p>';
  const testflight = links.testflightUrl
    ? `<a class="btn ghost" href="${esc(links.testflightUrl)}">Don't have the game? Get it on TestFlight</a>`
    : '<p class="muted">Don\'t have the game? Ask the team for the TestFlight invite.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Play "${esc(pkg.title)}" in SoundBeats</title>
<meta property="og:title" content="Play &quot;${esc(pkg.title)}&quot; in SoundBeats">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0d10;color:#f4f1ea;font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
main{width:100%;max-width:420px;text-align:center}.logo{letter-spacing:.18em;font-size:12px;opacity:.7;margin-bottom:20px}
.cover{width:100%;aspect-ratio:1;object-fit:cover;border-radius:18px;display:block;background:#1d1d24}.blank{display:grid;place-items:center;font-size:64px;color:#c6ff3d}
h1{font-size:24px;margin:18px 0 4px}.sub{opacity:.7;margin:0 0 18px;font-size:14px}
.btn{display:block;padding:15px 18px;border-radius:999px;background:#c6ff3d;color:#0d0d10;font-weight:700;text-decoration:none;margin:10px 0}
.btn.ghost{background:transparent;color:#f4f1ea;border:1px solid #3a3a44;font-weight:500}
.qr{display:none;margin:18px auto 6px;width:200px;padding:10px;background:#fff;border-radius:14px}.qr svg{display:block;width:100%;height:auto}
.desktop .qr{display:block}.desktop .cover{width:220px;margin:0 auto}.desktop .open{display:none}.hint{display:none;font-size:14px;opacity:.75}.desktop .hint{display:block}
.muted{opacity:.6;font-size:14px}.warn{background:#3a2a10;color:#ffd58a;padding:10px 12px;border-radius:10px;font-size:13px}
.small{font-size:12px;opacity:.55;margin-top:18px}.small a{color:inherit}
</style></head>
<body><main id="m">
<div class="logo">SOUNDBEATS</div>
${image}
<h1>${esc(pkg.title)}</h1>
<p class="sub">${esc(pkg.artist)} · difficulty ${links.difficulty}/10 · ${notes} notes</p>
${warn}
<a class="btn open" href="${esc(links.deepLink)}">Play in SoundBeats ▶</a>
<div class="qr" aria-label="QR code to open on your phone">${qr}</div>
<p class="hint">Scan with your iPhone camera to play.</p>
${testflight}
<p class="small"><a href="${esc(links.packageUrl)}">Beatmap JSON</a></p>
</main>
<script>if(!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)&&!(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform)))document.getElementById('m').classList.add('desktop');</script>
</body></html>`;
}
