# Original song media: S3 and Arkiv handoff

## Storage

The private hackathon bucket is `soundbeats-ethglobal-media-20261106`, region
`ap-northeast-1` (Tokyo). The upload retained the original folder structure:

```text
soundbeats_songs_pack/
  MANIFEST.csv
  stage_browser/       # 24 MP3s and associated artwork
  beatmap_browser/     # 54 MP3s and associated artwork
```

AWS reported **152 successful files, 178.3 MB** on November 6, 2026.
The single failed file was `.DS_Store` (`NotReadableError`), which is not media
and is intentionally ignored. The successful files are 78 MP3s, 73 JPGs and
the manifest. Public access remains blocked; this change grants no IAM access.
Production and staging buckets were not changed.

## Catalog

`catalog.json` maps every song to its exact S3 audio key, original artwork key
(when supplied), byte count, SHA-256 and existing Arc song/release IDs.
It contains neither audio bytes nor wallet secrets.

All 78 song titles and release-to-song relationships were checked with read-only
`getSong` / `getRelease` calls against the deployed Arc contract:
https://explorer.testnet.arc.io/address/0x71a39b29e81497af2d8c3ab315ce3d778e999471

The IDs originally came from the local seeding checkpoint; the JSON preserves
that provenance. Do not register or publish duplicate songs/releases.

- Album names were not supplied, so `album` is null rather than an invented album.
- Five tracks lack a separate supplied JPG. Use a neutral fallback, not a
  random image represented as the artist's original cover.
- Thirteen manifest size values differ from the supplied MP3 sizes. Exact
  artist/title filenames resolve these matches; the catalog records actual
  sizes and hashes as well as the original manifest sizes.
- No playable beatmap files were supplied. `beatmap` is null. Existing seeded
  source labels/difficulties/beatmap IDs do not prove a real beatmap exists.
- Audius provenance alone does not verify reuse or commercial rights.
  `rightsStatus` remains `not-verified`; artist authorization is a separate check.

## Integration still required

This PR is data and documentation only. It does **not** change the live UI,
grant AWS permissions, replace contract metadata, or publish anything to Arkiv.

1. Give only the hackathon backend role `s3:GetObject` permission for
   `arn:aws:s3:::soundbeats-ethglobal-media-20261106/soundbeats_songs_pack/*`.
   Prefer the EC2 instance role; do not put AWS keys in the frontend or repo.
2. Use the catalog's allowlisted object keys. Do not accept arbitrary S3 keys
   from clients. Resolve player identity and check access to the requested Arc
   release before providing full paid audio.
3. Return short-lived presigned audio URLs after authorization, or stream
   through an authenticated backend endpoint with HTTP Range support.
   Original artwork can use a separate backend route suitable for catalog display.
4. Store stable catalog IDs, S3 object references and Arc IDs in Arkiv, not
   expiring signed URLs or the MP3/JPG bytes. Use the stable catalog ID as an
   idempotency key and reconcile an existing entity before creating another.
   The backend resolves current playback URLs on demand.
5. Update the catalog UI to read the original artwork from this metadata instead
   of the Picsum placeholders. Confirm playback and access checks on iPhone.
6. Generate or attach actual beatmaps and connect them to the existing release IDs
   before claiming that these releases are playable in Unity.

World sign-in must also be enforced at the backend and, for protected on-chain
actions, in a way that cannot be bypassed by directly calling the contract.
Frontend-only hiding of controls is not an enforcement mechanism.

## Rebuilding the mapping

Run `scripts/build-media-catalog.py` with the original ZIP and the local seeding
checkpoint. The checkpoint includes sensitive wallet material: keep it private
and never commit or send it to the client. The builder retains only song/release
IDs and performs no network requests or writes.
