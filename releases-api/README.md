# SoundBeats Releases API (artist uploads)

Small Node service behind `https://arc.ethglobal.soundbeats.io/api/`. It lets an artist upload a song and cover, register the song on Arc from their own wallet, and publish the catalog record to Arkiv.

## Flow

1. `POST /api/uploads` with `{ title, artistName, genre, wallet }` creates a draft.
2. `PUT /api/uploads/:id/audio` (MP3, 25 MB max) and `PUT /api/uploads/:id/artwork` (JPG/PNG/WebP, 5 MB max) store the files in the private S3 bucket under `artist_uploads/<id>/`. Files are checked by their bytes, not their names, and their SHA-256 is recorded.
3. The artist's wallet calls `registerSong` on the SoundBeatsReleases contract. The metadata contains `uploadId` and the cover URL.
4. `POST /api/uploads/:id/finalize` with `{ txHash }`. The server reads the Arc receipt itself, finds the `SongRegistered` event for this upload, checks the artist wallet, then writes an Arkiv entity (`soundbeats.ethglobal.artist_songs.v1`).
5. `GET /api/media/:id/audio|artwork` redirects to a one-hour signed S3 URL. The bucket stays private.

Other routes: `GET /api/uploads/:id`, `GET /api/uploads?artist=0x…`, `GET /api/health`.

## Where data lives

| Data | Where |
| --- | --- |
| MP3 and cover | AWS S3 `soundbeats-ethglobal-media-20261106` (private, encrypted) |
| Catalog record (title, artist, S3 keys, hashes, Arc song id and tx) | Arkiv Rabdi, owned by writer `0xf5D6…d8d8` |
| Song, releases, purchases, 70/30 split | Arc contract `0x71a39b29e81497af2d8c3ab315ce3d778e999471` |

## Server setup

The EC2 instance needs an IAM role that allows `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::soundbeats-ethglobal-media-20261106/artist_uploads/*`. No AWS keys are stored in files. Arkiv uses the existing `~/secrets/arkiv.env`.

```bash
bash ~/soundbeats-releases/releases-api/deploy/install.sh
```

## Test

```bash
npm install && npm test
```
