# Soundbeats picture-to-music handoff

Status: local MVP, checked on 6 November 2026. This document describes the code in this repository and the tests actually performed. The separate on-chain practice handoff is context for later work; it is not part of this implementation.

## What exists

- A React/Vite page accepts one JPEG, PNG, or WebP image (up to 5 MB) and an optional text prompt (up to 500 characters). It submits a job, polls for completion, previews the audio, and offers a download.
- The Node server holds `GEMINI_API_KEY` and sends the image and prompt to Google's `lyria-3.5` model through the Gemini Interactions API. The default prompt asks for an energetic instrumental game soundtrack with no vocals. The model may interpret prompts differently; tempo and exact duration are not enforced.
- A completed live job stores an MP3 and a JSON record in the local `data/` directory. A demo job produces an original eight-second WAV sample, independently of the uploaded image. The UI labels this clearly.
- Preview playback has play/pause, a draggable timeline, elapsed/total time, and 10-second skip buttons. The audio endpoint supports HTTP byte ranges for seeking.

## Run locally

Requires Node.js 20.19+ and npm. From this repository:

```sh
npm install
npm run build
export GEMINI_API_KEY='your-key'
npm start
```

Open `http://localhost:3000`. Omit the key only when selecting **Use demo track**. After editing frontend source, rebuild and restart. During development, run `npm run server` and `npm run dev` in separate terminals; Vite normally serves port 5173 and proxies `/api` to port 3000. Never commit the API key or include it in a browser request. `.env`, `data/`, `dist/`, and `node_modules/` are ignored by Git.

## API contract for game integration

`POST /api/tracks` with JSON:

```json
{"imageBase64":"<raw image bytes encoded as base64>","prompt":"fast electronic rhythm","demo":false}
```

`prompt` is optional. `demo` defaults to `false`. The response is HTTP 202 with an `id`, `status: "processing"`, `source`, and `createdAt`. Poll `GET /api/tracks/{id}` until `status` becomes `completed` or `failed`. A completed record contains `audioUrl`, `format`, `mimeType`, `durationSeconds`, and `generationTimeMs`. For Lyria MP3s, `durationSeconds` is currently `null`; the browser derives duration from the audio file. `audioUrl` is relative to this server. `GET /api/tracks/{id}/audio` returns the file, supports `Range: bytes=...` with HTTP 206, and can be downloaded as a local MP3. A failed record contains an `error` message.

The server binds to `127.0.0.1`; an iPhone TestFlight build cannot reach this Mac-only address. For the present handoff, download the MP3 and transfer it through the Unity teammate's chosen local-file import path. A networked deployment or direct phone import requires a separate design and security work.

## Verification completed

- The user reported successfully generating an approximately three-minute live track from an image. The local `data/` folder contains completed Lyria MP3 records, including jobs that recorded generation times of 30.991 and 35.266 seconds. These values are observations, not a latency guarantee. A live MP3 download was not separately confirmed in the browser checks.
- `npm run build` passed after the player changes. `npm test` passed submission, polling, demo WAV download, rejection of an unsupported image and an overlong prompt, and byte-range responses (206 and 416).
- An existing generated MP3 returned `206 Partial Content`, `Accept-Ranges: bytes`, and the requested `Content-Range` in a direct HTTP check.
- Browser checks used the demo track to verify play/pause, timeline seeking, and both skip controls. No new paid Lyria request was made for these checks.
- Unity import, beatmap auto-generation, and playback on a TestFlight iPhone have not been verified in this repository.

## Unity handoff and open decisions

The teammate reported that the game is built in Unity, accepts a local MP3, and has its own level auto-generation function. This portal does not produce beatmap JSON. The next proof is: download a generated MP3, import it through the actual Unity path, auto-generate one level, and play that level on the iPhone. Ask the teammate for the exact import function, supported file size/sample rate/channel/duration limits, a known-good MP3 and beatmap example, and the phone's file-transfer path. The attached on-chain practice handoff describes a separate checkout/access-gate experiment; it does not verify this audio handoff.

## Current limits

This is a localhost demo server with no authentication, rate limiting, cloud storage, or public deployment setup. Uploaded images are sent to Google for live generation but are not saved locally. Each new live submission may incur a provider charge. Records and audio survive server restarts in `data/`; processing jobs are marked failed after a restart. The provider call has a 180-second timeout. The app does not calculate BPM, trim songs, guarantee a target duration, create levels, manage rights for the supplied song pack, or implement wallet payments and revenue splits.
