# SoundBeats Releases

An onchain publishing and payment layer for a music rhythm game on Arc Testnet. Artists register songs, beatmap creators publish releases, and players pay in USDC for access. Every sale is split instantly: 70% to the artist and 30% to the beatmap creator. Brands can sponsor free passes that players claim, one per wallet per release.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Catalog of releases with difficulty, source (auto map or hand-made) and price, with one-tap buying in USDC
- My access page for releases you own and free sponsored passes you can claim
- Artist, Creator and Brand dashboards for earnings, publishing and sponsoring
- Works with MetaMask, including the MetaMask mobile browser on iPhone

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, Solidity (Foundry), Arc Testnet with USDC

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
bun run dev        # start the app on port 5173
bun run check      # lint and typecheck
bun run contracts:build
bun run contracts:test
```

### Environment variables

None.

### Contract

The `SoundBeatsReleases` contract lives in `contracts/SoundBeatsReleases.sol` and is deployed on Arc Testnet. The address is set in `src/contracts/soundBeats.ts`. After changing the contract, rebuild it and regenerate `src/contracts/soundBeatsAbi.ts` from the build output.
