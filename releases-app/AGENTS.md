# SoundBeats Releases

> Built with Arc Studio - money-powered apps in minutes

## Deployments

- `SoundBeatsReleases` on Arc Testnet: `0x71a39b29e81497af2d8c3ab315ce3d778e999471` (USDC `0x3600000000000000000000000000000000000000`). Owner is the platform deployer wallet (Mode 1 deploy), platform fee 0%, fee recipient unset. Wired in `src/contracts/soundBeats.ts`; ABI in `src/contracts/soundBeatsAbi.ts` (regenerate from `contracts/out/` after contract changes).
- Seeded with 3 demo songs and 3 releases by `scripts/seed-demo.ts` using throwaway demo wallets (keys discarded, demo earnings are not withdrawable).
- Payout wallets per release can be rotated onchain by their current holder (`updateReleaseArtistWallet` / `updateReleaseCreatorWallet`), a safeguard if a payout wallet is USDC-blocklisted. No UI yet.
- Wallet connect: wagmi injected connector (MetaMask extension and MetaMask mobile in-app browser). Without an injected wallet (iPhone Safari) the button deep-links into the MetaMask app.

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Onchain publishing and payment layer for a music rhythm game. Artists register songs, beatmap creators publish releases, players pay USDC for access (70% artist / 30% creator, instant), and brands sponsor free passes. Tabs: Catalog, My access, Artist, Creator, Brand.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```
