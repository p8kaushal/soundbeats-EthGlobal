# ETHGlobal Hackathon Log — SoundBeats

Feature built during the event: **Picture → Music → Playable Beatmap**.
Upload a photo, generate an original track (Lyria), then auto-generate a playable SoundBeats beatmap for it.

Beatmap generation uses SoundBeats' existing proprietary engine through a private API. The engine code is not part of this repo; everything here is new, open-source integration and UI work.

## Log

### 2026-11-06
- Repo created; Parth's picture-to-music MVP merged (PR #1): React/Vite UI, Node server, Lyria provider, demo mode.
- Hackathon server provisioned (isolated from SoundBeats production/staging).
- Beatmap integration (PR #2): `beatmapClient.js`, `POST/GET /api/tracks/{id}/beatmap?difficulty=1-10`, "03 / Play" panel with difficulty slider, chart preview, stats and download; mock mode for local testing; docs and sample beatmap.
- Private beatmap engine deployed on the hackathon server as a localhost-only service (token-protected, not publicly reachable); health check passing.
- Beatmap feature merged to main (PR #2); teammate connected to the live engine through an SSH tunnel.
- "Play in SoundBeats": play link + QR landing page, public play package (beatmap + audio URL + cover photo), `play-link` API for the AI agent, tests. Deep link `soundbeats://play?pkg=…` opens the iOS TestFlight build.
- Next: public HTTPS address for the server, game-side deep link handling (TestFlight build), real Lyria track end to end.

## Planned
- Fast auto-generated beatmaps for picture-to-music (in progress).
- Creator beatmap editor with more controls (later).
- AI agent + web3 layer (Parth).

## AI usage
AI coding assistants (Perplexity Computer) were used for planning, integration code, tests and docs. Music is generated with Google Lyria via the Gemini API.
