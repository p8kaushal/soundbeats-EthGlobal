# SoundBeats agent MVP

The agent screen sends typed text to Gemini and records microphone audio for Google Gemini transcription. Upload an image, select difficulty, and choose Create music & beatmap. The server uses Lyria to create audio, then calls the configured SoundBeats beatmap engine. Demo audio and mock beatmaps are labeled; no text-to-speech is included.

Run with Node 22.10+, `npm ci`, `npm run build`, and `npm start`. Set `GEMINI_API_KEY` and the private engine URL/token in the server environment. When World is configured, live generation requires verification; the agent links to the World flow. Do not expose a public paid generation service without additional abuse controls and a billing budget. Microphone access requires HTTPS or localhost and browser MediaRecorder support. Google chat, transcription and music each consume API quota and may incur charges. Google service regional terms apply.

The chat endpoint currently sends only the latest message to Gemini. Generation uses the text currently in the composer, or the latest sent user message if the composer is empty. The image is sent to Lyria for generation but not to the chat model. After beatmap generation the screen shows the existing play page and QR code. Live-generated tracks with real engine beatmaps can be published using the configured Arc and Arkiv services. See `ARC_PAYMENTS.md` and `PLAY_IN_GAME.md`; real payment, game import and hosted agent flows require separate verification.

## Test live music and the real beatmap on a Mac

1. Run `npm ci` and `npm run build` in this checkout. Use Node 22.10 or newer.
2. Create a local `.env` with `GEMINI_API_KEY`, `BEATMAP_ENGINE_URL=http://127.0.0.1:4100`, `BEATMAP_ENGINE_TOKEN`, `BEATMAP_ENGINE_MOCK=0`, `BASE_PATH=`, `PUBLIC_BASE_URL=`, and `PORT=3000`. Keep `.env` out of Git. Get the engine token from Taral; the Gemini key is already held by the team. World verification is enabled when its credentials are configured.
3. In a separate terminal, run `ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes -N -L 4100:127.0.0.1:4100 ubuntu@52.199.14.79`. Keep it open. Check `curl http://127.0.0.1:4100/healthz` returns `{"ok":true}`. `ECONNREFUSED` means the tunnel or private engine is not listening.
4. In the app terminal, load the environment with `set -a; . ./.env; set +a; npm start`, then open `http://localhost:3000`. Attach a JPEG, PNG, or WebP under 5 MB, type a mood, choose difficulty, leave **Demo audio** unchecked, and select **Create music & beatmap**. Wait for the Lyria MP3 and engine beatmap. Preview audio and chart, then download both files.
5. For an inexpensive interface check, use **Demo audio** and set `BEATMAP_ENGINE_MOCK=1` with `BEATMAP_ENGINE_URL=`. The resulting WAV and notes are explicitly placeholders, not a live Lyria or engine test.

Chat and final voice transcription use Gemini requests. The optional live words shown while recording come from the browser's SpeechRecognition support when present; they add no app Gemini request. Browser implementations may use their own speech service. The final transcript is still sent to the configured Google endpoint after stopping the recording. If live words are unsupported, the screen shows a listening state until the final transcript arrives.
