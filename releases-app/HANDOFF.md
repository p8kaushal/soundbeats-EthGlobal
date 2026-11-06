# SoundBeats Releases: handoff (on-chain publishing on Arc)

Built in Arc Studio (required for the Arc prize).
Studio project: https://studio.arc.io/app/d129b4a1-d0c0-4938-902d-36723d30edb0

## What's live
- App: https://arc.ethglobal.soundbeats.io (static build from `releases-app/dist`, served by Nginx from `/var/www/arc`)
- Contract `SoundBeatsReleases` on Arc Testnet (chain ID 5042002):
  `0x71a39b29e81497af2d8c3ab315ce3d778e999471`
  https://explorer.testnet.arc.io/address/0x71a39b29e81497af2d8c3ab315ce3d778e999471
- USDC (Arc Testnet ERC-20 interface): `0x3600000000000000000000000000000000000000`

## What the contract does
- Artists register songs; beatmap creators publish releases (beatmap ID, auto/manual, difficulty 1-10, USDC price).
- Players buy access in USDC; the payment is split instantly 70% artist / 30% creator. The contract never holds funds.
- Brands sponsor passes (price x quantity, same 70/30 split); players claim one free pass per wallet per release.
- Platform fee: 0% by default (owner-configurable, capped at 10%). The owner is currently Arc Studio's shared deploy wallet.
- Views: `hasAccess(release, wallet)`, release details, earnings per artist/creator, brand pass stats.

## Still to do (Parth)
1. **World Agent Pass**: gate the protected actions (suggested: brand pass claim = one per verified human, and publishing a release). Backend validation + a cancelled/failed path that doesn't execute the action. Client ID and secret are on the server in `~/secrets/world.env`; redirect URI `https://ethglobal.soundbeats.io/api/auth/world/callback`.
2. **Arkiv**: write the public catalog (song/release metadata, beatmap ID, links; no audio/photos, max 128 KB) to Arkiv Rabdi, and have a user-facing page read it. Writer wallet and access key are on the server in `~/secrets/arkiv.env`.
3. **Game access check**: a backend endpoint like `/api/game-access?wallet=...` that calls `hasAccess` on the contract, so the Unity game can unlock the beatmap (same pattern as the earlier practice test).
4. **Play counts** for the artist/creator dashboards come from the game/backend, not the chain.

## Redeploying the static site on the server
```bash
cd ~/soundbeats-EthGlobal && git fetch origin feature/arc-releases && sudo rm -rf /var/www/arc/* \
  && git archive FETCH_HEAD releases-app/dist | sudo tar -x -C /var/www/arc --strip-components=2
```
Build locally with `npm install --legacy-peer-deps && npx vite build` (or `bun install && bun run build`) in `releases-app/`, then commit `dist` (`git add -f releases-app/dist`; it's gitignored at the repo root).

Never commit `.env` or secrets. The Arc Studio `.env` (RPC proxy token) is intentionally excluded.

## Artist upload (added)

The Artist tab now uploads an MP3 and cover through `releases-api/` (served at `/api/` on the same domain). Files go to private S3 under `artist_uploads/<uploadId>/`. The artist's wallet registers the song on Arc with `uploadId` and the cover URL in the metadata (512-byte limit). The server then verifies the Arc receipt and writes an Arkiv entity with schema `soundbeats.ethglobal.artist_songs.v1`. The game's `soundbeats.ethglobal.tracks.v1` schema is unchanged. See `releases-api/README.md`.
