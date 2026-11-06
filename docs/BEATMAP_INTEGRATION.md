# Beatmap generation

After a track is generated, the app can turn it into a playable SoundBeats beatmap.

Beatmaps are made by the **SoundBeats beatmap engine**. This is SoundBeats' existing, proprietary auto-generation engine, which predates the hackathon. It runs as a separate private service and is **not included in this repository**. This app only sends it an audio file and receives a beatmap back, through `beatmapClient.js`.

```
Photo ─► Lyria track (this app) ─► POST audio to the private engine ─► v2 beatmap JSON ─► SoundBeats game
```

## Using it in the app

1. Generate a track (live or demo).
2. Under **03 / Play**, pick a difficulty from 1 (easy) to 10 (hard) and click **Generate beatmap**.
3. The app shows a preview, the note counts and the BPM. Click **Download beatmap JSON** to save it.

## App API

| Request | Result |
|---|---|
| `POST /api/tracks/{id}/beatmap?difficulty=1-10` | `200 { beatmap, info, source, beatmapUrl }`. `source` is `engine` or `mock` |
| `GET /api/tracks/{id}/beatmap?difficulty=1-10` | Downloads the saved beatmap JSON (404 if not generated yet) |

Errors: `400` for a bad difficulty, `404` for an unknown track, `409` if the audio isn't ready, `502` if the engine fails, and `503` if the engine isn't configured. Generated beatmaps are listed in the track record under `beatmaps`.

```sh
curl -s -X POST "http://localhost:3000/api/tracks/$TRACK_ID/beatmap?difficulty=5"
```

## Connecting to the engine

The engine runs on the hackathon server and only listens on `127.0.0.1:4100`, so it is not reachable from the internet. Ask Taral for the `BEATMAP_ENGINE_TOKEN`.

### On the hackathon server

```sh
BEATMAP_ENGINE_URL=http://127.0.0.1:4100
BEATMAP_ENGINE_TOKEN=<token from Taral>
```

### From your laptop, through an SSH tunnel

This needs SSH access to the hackathon server (see the server access guide). In one terminal, keep the tunnel open:

```sh
ssh -N -L 4100:127.0.0.1:4100 ubuntu@<hackathon-server-ip>
```

Then run the app locally with the same two variables as above. Requests to `127.0.0.1:4100` on your laptop go through the encrypted tunnel to the engine. No firewall ports need opening.

Quick check that the tunnel works:

```sh
curl -s http://127.0.0.1:4100/healthz    # {"ok":true}
```

### Without the engine (UI work only)

```sh
BEATMAP_ENGINE_MOCK=1 npm start
```

This returns evenly spaced placeholder notes that don't follow the music, labelled "Mock" in the UI. Use it only for building the interface.

## Engine API (for the AI agent or other services)

```
POST {BEATMAP_ENGINE_URL}/v1/beatmaps?difficulty=5&title=...&artist=...&guid=...
Authorization: Bearer {BEATMAP_ENGINE_TOKEN}
Content-Type: audio/mpeg            (or audio/wav, etc.)
Body: raw audio bytes (max 25 MB)

200 -> { "beatmap": { ...v2 JSON... }, "info": { "bpm", "durationSeconds", "difficulty", "stats", "problems", "warnings", "elapsedMs" } }
GET {BEATMAP_ENGINE_URL}/healthz -> { "ok": true }
```

Errors: `400` for a bad parameter, `401` for a missing or wrong token, `413` if the file is too large, and `422` if the audio can't be decoded or is under 1 second. A three-minute song takes about 1–2 seconds.

## Beatmap format (v2)

This is the format the game reads. See `examples/sample-beatmap-d5.json` for a real example.

```json
{
  "version": 2,
  "startTime": 0,
  "beats": [ { "t": 1.25, "x": 0.42, "type": 0, "hold": 0, "width": 0.4 } ],
  "title": "", "artist": "", "imageUrl": "",
  "source": { "audiusId": "", "mubertS3url": "", "guid": "" }
}
```

| Field | Meaning |
|---|---|
| `t` | Time in seconds from the start of the track. Beats are sorted by `t` |
| `x` | Horizontal position, from 0 (left) to 1 (right) |
| `type` | `0` attack, `1` jump (road block), `2` slide (signage) |
| `hold` | Hold length in seconds (`0` = tap) |
| `width` | Note width as a fraction of the playable area |
| `source` | Legacy fields kept so the game's parser accepts the file. Leave them as empty strings |

## Still to confirm

- How the game loads a custom track plus beatmap. This is being confirmed with the Unity developer.
- How the generated beatmaps play on an iPhone.
