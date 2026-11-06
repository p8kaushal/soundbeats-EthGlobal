# Arc payments for AI levels

Players pay **1.5 USDC on Arc Testnet** to unlock an AI-generated level, then it opens in the SoundBeats iOS game.
Payments go straight to the SoundBeats wallet; nothing is held by the server or the contract.

Contract: `SoundBeatsReleases` on Arc Testnet (chain 5042002), `0x71a39b29e81497af2d8c3ab315ce3d778e999471`
([explorer](https://explorer.testnet.arc.io/address/0x71a39b29e81497af2d8c3ab315ce3d778e999471)). No contract changes.

## Flow

1. **Create:** photo → Lyria music → engine beatmap (`/game`).
2. **Publish:** the creator clicks *Publish on Arc + Arkiv*. The server's publisher wallet calls
   `registerSong` and `publishRelease` (price 1.5 USDC), then `updateReleaseArtistWallet` and
   `updateReleaseCreatorWallet` so both payout shares (70% + 30%) go to the SoundBeats wallet
   `0xE4bd45C71e54f851d0c0349339B2aEDA551b7f49`. The release ID is saved to Arkiv with the level metadata.
3. **Pay:** the shared play page shows *Unlock for 1.5 USDC*. The player connects MetaMask
   (desktop extension, or the MetaMask app's browser on iPhone), approves exactly 1.5 USDC and calls `buyAccess`.
4. **Unlock:** the server checks `hasAccess(release, wallet)` on-chain and returns a play link signed for that wallet.
5. **Play:** the signed link opens the game; the game's package request is refused (`402`) without a valid signature.

Unpublished levels stay free for the creator to test. After publishing, the creator's own browser gets a free
"play it yourself" link.

## Server settings

| Variable | Meaning |
|---|---|
| `ARC_PUBLISHER_KEY` | Private key of the server publisher wallet. Only needs a little test USDC for gas; it never receives sales. Keep it in `~/secrets/arc.env`. |
| `ARC_PAYOUT_WALLET` | Wallet that receives 100% of each sale (default: the SoundBeats wallet above). |
| `ARC_PRICE_USDC` | Price per level (default `1.5`). |
| `ARC_RPC_URL` | Optional RPC override. |
| `ARC_LINK_SECRET` | Optional secret for signed play links (derived from the publisher key if empty). |

World verification is optional: it's only required when `WORLD_CLIENT_SECRET` is set.

## Notes

- Signed play links can be shared by the buyer. That's acceptable for the hackathon demo.
- On a local Anvil fork of Arc, `buyAccess` reverts because Arc's native USDC blocklist precompile isn't available;
  it works on Arc Testnet itself.
