# Existing flows and purchase-status fix checks

Preserve the existing design and five tabs: Catalog, My access, Artist, Creator,
Brand. No contract, wallet ownership, payment amount or revenue split changes.

- Catalog loads releases; All, Auto map and Hand-made filter correctly.
- Disconnected users see wallet connection controls, not enabled purchase actions.
- My access, Artist, Creator and Brand show their disconnected states.
- Connected users: exact USDC allowance, purchase, claim, register, publish and
  sponsor flows retain explicit wallet approval. Never resend automatically.
- Purchase-status fix: "already known"/timeout/rate-limit after submission shows
  checking/unknown, not a confirmed revert.
- Approval recovery only advances after receipt success or adequate allowance.
- Purchase recovery only succeeds after receipt success or hasAccess true.
- A genuine reverted receipt remains a failure.
- Unknown status blocks immediate repeated submits and explains how to check.
- Access true suppresses stale purchase error on the release card.
- "Access unlocked" does not claim that a playable beatmap is connected.
- Refresh failure after receipt success does not turn success into failure.

Read-only live verification: wallet 0xE4bd45C71e54f851d0c0349339B2aEDA551b7f49
has release 81; not release 80; allowance is 1 USDC at investigation time.
No test transactions should be signed for QA.
