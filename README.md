# Soundbeats Studio

A local, standalone image-to-music web app and API for the Soundbeats game. Live generation uses Google's Lyria 3.5. Demo mode returns an original synthesized eight-second WAV sample; it is not generated from the uploaded image.

## Run

Requires Node.js 20.19 or later. The frontend uses React and Vite; the API runs on Node.js.

```sh
npm install
npm run build
export GEMINI_API_KEY='your-key'
npm start
```

Open http://localhost:3000. A key is not needed for the explicitly selected demo mode. Set `PORT` to change the port. Do not commit or share your key. The server listens on localhost and is intended for a trusted local hackathon demo, not public deployment: there is no authentication, rate limiting, durable cloud storage, or abuse protection. Tracks and metadata are stored in `data/` and survive restarts; uploaded images are not saved.

Google's [music documentation](https://ai.google.dev/gemini-api/docs/music-generation) describes image inputs and 44.1 kHz stereo MP3 output. As of 5 November 2026, [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing) lists Lyria 3.5 at $0.08 per song and no free tier. Billing, regional/model access, quota, latency and applicable [Gemini API terms](https://ai.google.dev/gemini-api/terms) must be checked for your account. Live generation has a three-minute timeout; actual latency and cost have not been measured without credentials. Generated audio carries Google's SynthID watermark.

## Frontend development

Start the API in one terminal with `npm run server`. In another terminal run `npm run dev`, then open the Vite URL shown (normally http://localhost:5173). Vite forwards `/api` requests to the API on port 3000. If using live generation, set `GEMINI_API_KEY` in the API terminal before starting it. Run `npm run build` after changes; `npm start` serves the built frontend and API together on port 3000.

## Game integration

Each track can be turned into a playable beatmap (difficulty 1–10) through SoundBeats' private beatmap engine. The engine is proprietary and not part of this repository; the app calls it over an authenticated API. See [docs/BEATMAP_INTEGRATION.md](docs/BEATMAP_INTEGRATION.md) for setup, the API, the beatmap format and mock mode. Confirm the game's supported audio formats and duration with the game teammate. The API returns relative URLs, so resolve them against the server origin. Localhost URLs are reachable only on the machine running the server.

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

## Checks

Run `npm test` (the beatmap test uses mock mode, so it does not need the engine). To validate live generation, configure a paid, authorized key, submit a real image, record the elapsed time and provider billing, and check the downloaded MP3 in the game. The demo sample is WAV and does not prove MP3 compatibility.
