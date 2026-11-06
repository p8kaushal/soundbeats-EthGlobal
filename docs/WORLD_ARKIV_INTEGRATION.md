# World verification and Arkiv publishing

This is the server contract for the ETHGlobal demo at `https://ethglobal.soundbeats.io`.

## User flow

1. A visitor uploads an image and chooses a mood.
2. For live Lyria generation, the browser starts World Agent Pass. The backend uses authorization code flow with PKCE, validates the signed ID token, and grants one live generation request for ten minutes.
3. The app generates an MP3, then sends it to the private Soundbeats engine for a v2 beatmap.
4. The creator previews both outputs and publishes the track. Publishing requires the same browser session, a live Lyria track, and a real engine beatmap.
5. The server writes public metadata to Arkiv. The public catalog queries Arkiv and links to the audio and beatmap hosted by this server.

Demo WAV tracks and mock beatmaps cannot be published. World Agent Pass currently provides hackathon identity results and must not be represented as production identity assurance.

## Environment

Use Node.js 22.10 or later. Load secrets into the process before `npm start`. The server expects:

- `GEMINI_API_KEY`
- `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET`, `WORLD_ISSUER`, `WORLD_REDIRECT_URI`
- `ARKIV_PRIVATE_KEY`, `ARKIV_ACCESS_KEY`
- `BEATMAP_ENGINE_URL`, `BEATMAP_ENGINE_TOKEN`
- `PUBLIC_BASE_URL=https://ethglobal.soundbeats.io`
- `NODE_ENV=production`, `PORT=3000`

The registered World callback is `https://ethglobal.soundbeats.io/api/auth/world/callback`. The configured Arkiv writer is `0xf5D6dd74586be3a2C95D29E33226821f6fD0d8d8` on Rabdi, chain ID `7794095`.

## API

- `GET /api/auth/world/status` reports whether this browser has a fresh authorization.
- `GET /api/auth/world/start` begins World authorization.
- `GET /api/auth/world/callback` is the registered backend callback.
- `POST /api/tracks` consumes one World authorization for a live request. Demo requests do not require World.
- `POST /api/tracks/{id}/beatmap?difficulty=1-10` generates a beatmap.
- `POST /api/tracks/{id}/publish` accepts `{ "title", "creator", "difficulty" }`.
- `GET /api/catalog` queries published track metadata from Arkiv.

Audio and beatmaps remain server files. Arkiv stores metadata and public links, so those links depend on this deployment and its disk.

## Deployment

Build and run the app behind the existing Nginx proxy on `127.0.0.1:3000`. The secret files currently live at `~/secrets/world.env` and `~/secrets/arkiv.env`; the Gemini and beatmap variables must also be loaded into the service environment. Never copy secret values into Git.

Before claiming the integrations in a submission, record one complete World success and failure path, one Arkiv entity key, the writer address, a catalog query result, and a second-device HTTPS test.
