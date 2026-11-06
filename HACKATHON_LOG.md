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
- Parth verified the demo-audio flow against the real private engine: beatmap generation, preview and JSON download work with the issued token.
- Partner integration branch adds World Agent Pass before live Lyria generation and Arkiv publishing/catalog support. Local build and automated API checks pass; the live callback, first Arkiv write and public deployment remain to be verified on the server.
- Play in SoundBeats (PR #4): play links, QR landing page, hosted play package (beatmap + MP3) for the iOS game via `soundbeats://` deep link. Live at `/game` with real Lyria + engine beatmaps verified end to end.
- World verification + Arkiv publishing (PR #3) and the combined deployment (PR #5) merged into main. Next: run the combined app at the domain root (Node 22, World + Arkiv secrets) and verify World login, Arkiv publish and catalog.
- End to end on iPhone: photo → Lyria music → engine beatmap → play page → `soundbeats://` deep link → level plays in the SoundBeats iOS game (hackathon build). AI-level scores are kept off the production leaderboard. Game code stays in the private game repo.

- Arc payments for AI levels: publishing lists the level on the SoundBeats Releases contract for 1.5 USDC with 100% of each sale to the SoundBeats wallet; the play page takes MetaMask payment and only then gives out the game link (checked on-chain with `hasAccess`). Release ID is saved to Arkiv. World verification made optional. Tested on a local fork of Arc Testnet.

## Planned
- Fast auto-generated beatmaps for picture-to-music (done).
- Creator beatmap editor with more controls (later).
- AI agent + web3 layer (Parth).

## AI usage
AI coding assistants (Perplexity Computer and OpenAI Codex) were used for planning, integration code, tests and docs. Music is generated with Google Lyria via the Gemini API.
