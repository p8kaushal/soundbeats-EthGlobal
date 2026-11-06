# Play in SoundBeats (deep link into the game)

After a track and beatmap are generated, the app creates a link that opens the SoundBeats iOS app (TestFlight build) straight into that level.

```
web app / AI agent ──> /play/{id}?difficulty=N        landing page: button (phone) or QR code (desktop)
                          │
                          └─> soundbeats://play?pkg=<package URL>     opens the game
                                   │
                                   └─> GET /api/play/{id}/{N}.json    the game downloads the level
```

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/tracks/{id}/play-link?difficulty=N` | Links as JSON (see below). Omit `difficulty` to use the latest generated beatmap. **Use this from the AI agent.** |
| GET | `/play/{id}?difficulty=N` | Landing page: cover, "Play in SoundBeats" button on phones, QR code on desktop, TestFlight fallback. |
| GET | `/api/play/{id}/{N}.json` | The play package the game loads (public, CORS `*`). |
| GET | `/api/tracks/{id}/play-qr.svg?difficulty=N` | QR code (SVG) for the landing page. |
| GET | `/api/tracks/{id}/image` | The uploaded photo (used as cover art). |

A beatmap must exist first: `POST /api/tracks/{id}/beatmap?difficulty=N`.

### `play-link` response

```json
{
  "trackId": "2a374aa1-…",
  "difficulty": 5,
  "playPageUrl": "https://ethglobal.soundbeats.io/game/play/2a374aa1-…?difficulty=5",
  "packageUrl": "https://ethglobal.soundbeats.io/game/api/play/2a374aa1-…/5.json",
  "deepLink": "soundbeats://play?pkg=https%3A%2F%2Fethglobal.soundbeats.io%2Fgame%2Fapi%2Fplay%2F2a374aa1-…%2F5.json",
  "qrSvgUrl": "https://ethglobal.soundbeats.io/game/api/tracks/2a374aa1-…/play-qr.svg?difficulty=5",
  "testflightUrl": "https://testflight.apple.com/join/…",
  "reachableFromPhone": true
}
```

Share `playPageUrl` with users. It works on any device and handles the "game not installed" case.

### Play package

A standard v2 beatmap (same format as `examples/sample-beatmap-d5.json`), with:

- `source.mubertS3url`: public URL of the track audio, which the game streams from here
- `source.guid`: the track id
- `imageUrl`: the uploaded photo
- `title`, `artist`: display text

## Configuration

| Variable | Purpose |
|---|---|
| `PUBLIC_BASE_URL` | Public HTTPS origin phones can reach, e.g. `https://ethglobal.soundbeats.io/game`. Defaults to the request host; `localhost` links only work on the same machine, and the page shows a warning. iOS needs HTTPS. |
| `BASE_PATH` | Sub-path when served behind nginx, e.g. `/game`. See `deploy/nginx-game.conf` and `deploy/soundbeats-ethglobal-app.service`. |
| `GAME_URL_SCHEME` | App URL scheme (default `soundbeats`). |
| `TESTFLIGHT_URL` | Public TestFlight invite link shown when the game isn't installed. |

## Game side (summary)

The game registers the `soundbeats://` scheme, reads `pkg` from the link, downloads the package from an allow-listed HTTPS domain, validates it, and starts the level using the audio URL in `source.mubertS3url`. That work lives in the private game repo.

## Privacy note

Anyone with a play link can open the track, photo and beatmap. Track ids are random UUIDs, so links can't be guessed, but treat them as shareable.
