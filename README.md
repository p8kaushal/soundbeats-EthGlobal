# Soundbeats Studio

A web app that turns an image into music and a playable Soundbeats beatmap. Live generation uses Google's Lyria 3.5 after World Agent Pass verification. Creators can publish live track and real beatmap metadata to Arkiv, where the public catalog reads it back. Demo mode returns an original synthesized eight-second WAV sample; it is not generated from the uploaded image.

## Run

Requires Node.js 22.10 or later. The frontend uses React and Vite; the API runs on Node.js.

```sh
npm install
npm run build
set -a; . ./.env; set +a
npm start
```

Copy `.env.example` to `.env` and fill it locally without committing it. Open http://localhost:3000. The demo track does not require Gemini or World. Tracks and metadata are stored in `data/` and survive restarts; uploaded images are not saved. The hackathon deployment is `https://ethglobal.soundbeats.io`, served through Nginx with the Node process bound to localhost.

Google's [music documentation](https://ai.google.dev/gemini-api/docs/music-generation) describes image inputs and 44.1 kHz stereo MP3 output. As of 5 November 2026, [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing) lists Lyria 3.5 at $0.08 per song and no free tier. Billing, regional/model access, quota, latency and applicable [Gemini API terms](https://ai.google.dev/gemini-api/terms) must be checked for your account. Live generation has a three-minute timeout; actual latency and cost have not been measured without credentials. Generated audio carries Google's SynthID watermark.

## Frontend development

Start the API in one terminal with `npm run server`. In another terminal run `npm run dev`, then open the Vite URL shown (normally http://localhost:5173). Vite forwards `/api` requests to the API on port 3000. If using live generation, set `GEMINI_API_KEY` in the API terminal before starting it. Run `npm run build` after changes; `npm start` serves the built frontend and API together on port 3000.

## Game integration

Each track can be turned into a playable beatmap (difficulty 1–10) through SoundBeats' private beatmap engine. The engine is proprietary and not part of this repository; the app calls it over an authenticated API. See [docs/BEATMAP_INTEGRATION.md](docs/BEATMAP_INTEGRATION.md) for setup, the API, the beatmap format and mock mode. Confirm the game's supported audio formats and duration with the game teammate. The API returns relative URLs, so resolve them against the server origin. Localhost URLs are reachable only on the machine running the server.

**Play in SoundBeats:** once a beatmap exists, the app shows a play link and QR code that open the SoundBeats iOS app (TestFlight) straight into the level. The AI agent can get the link from `GET /api/tracks/{id}/play-link`. See [docs/PLAY_IN_GAME.md](docs/PLAY_IN_GAME.md).

Create a request (base64 is the raw file bytes, without a data URL prefix):

```sh
IMAGE_BASE64=$(base64 -i picture.jpg | tr -d '\n')
curl -s http://localhost:3000/api/tracks -H 'Content-Type: application/json' \
  -d "{\"imageBase64\":\"$IMAGE_BASE64\",\"prompt\":\"upbeat electronic\",\"demo\":true}"
```

Use a JSON-aware client for arbitrary user prompts. Accepted images: JPEG, PNG, WebP up to 5 MB. `prompt` is optional (maximum 500 characters); `demo` defaults to false. Response (HTTP 202):

```json
{"id":"a UUID","status":"processing","source":"demo","createdAt":"2026-11-05T00:00:00.000Z","audioUrl":null,"format":null,"mimeType":null,"durationSeconds":null}
```

Poll `GET /api/tracks/{id}` until `status` is `completed` or `failed`. A completed record includes `audioUrl`, `format`, `mimeType`, `durationSeconds` (null when unknown), and `generationTimeMs`. A failed record includes an `error`. Download `GET /api/tracks/{id}/audio` once completed. A new request creates a new track and may incur another provider charge. In-progress jobs are marked failed after a server restart. Audio and metadata remain until manually deleted from `data/`.

## World and Arkiv

Live generation requires a fresh World Agent Pass authorization. The backend uses authorization code flow with PKCE and validates the signed ID token before granting one live request. After generating a real engine beatmap, the same browser can publish public metadata to Arkiv's Rabdi testnet. Demo tracks and mock beatmaps cannot be published.

See [docs/WORLD_ARKIV_INTEGRATION.md](docs/WORLD_ARKIV_INTEGRATION.md) for the user flow, environment variables, API, and deployment notes. The Arkiv writer is `0xf5D6dd74586be3a2C95D29E33226821f6fD0d8d8`. With `ARKIV_ACCESS_KEY` loaded, reproduce the catalog query with:

```sh
npm run arkiv:query
```

## Checks

Run `npm test` (the beatmap test uses mock mode, so it does not need the engine) and `npm run build`. Live World, Lyria, engine and Arkiv verification requires the server credentials. Record the resulting Arkiv entity key and test the public HTTPS flow from a second device before submission.
