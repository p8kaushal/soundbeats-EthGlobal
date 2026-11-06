"""Build a private-S3 catalog without copying audio, images or wallet secrets.

Usage:
  python3 scripts/build-media-catalog.py PACK.zip --seed-state LOCAL_STATE.json \
    --output media/catalog.json

The seed state is read locally only. Only song/release IDs are retained.
This script performs no uploads or blockchain writes.
"""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("zip_path")
parser.add_argument("--seed-state", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
bucket = "soundbeats-ethglobal-media-20261106"
contract = "0x71a39b29e81497af2d8c3ab315ce3d778e999471"
state = json.loads(Path(args.seed_state).read_text())
song_ids, release_ids = state["songs"], state["releases"]
del state

with zipfile.ZipFile(args.zip_path) as pack:
    entries = {
        entry.filename: entry for entry in pack.infolist()
        if not entry.is_dir() and not entry.filename.startswith("__MACOSX/")
    }
    manifest = "soundbeats_songs_pack/MANIFEST.csv"
    rows = list(csv.DictReader(io.StringIO(pack.read(manifest).decode("utf-8-sig"))))
    audio = [e for e in entries.values() if e.filename.endswith(".mp3")]
    used = set()

    def asset(key, content_type):
        content = pack.read(key)
        return {
            "bucket": bucket,
            "key": key,
            "s3Uri": f"s3://{bucket}/{key}",
            "contentType": content_type,
            "sizeBytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
            "access": "private",
        }

    catalog = []
    for row in rows:
        folder = {"stage": "stage_browser", "beatmap": "beatmap_browser"}[row["pool"]]
        exact = f"soundbeats_songs_pack/{folder}/{row['artist']} - {row['title']}.mp3"
        matches = [entries[exact]] if exact in entries else [
            e for e in audio
            if e.file_size == int(row["size_bytes"])
            and e.filename.startswith(f"soundbeats_songs_pack/{folder}/")
        ]
        if len(matches) != 1:
            raise ValueError(f"Ambiguous or missing audio: {row['artist']} / {row['title']}")
        match = matches[0]
        # Filename first; unique byte count handles filename sanitization.
        if not Path(match.filename).name.startswith(row["artist"] + " - "):
            raise ValueError(f"Artist mismatch: {match.filename}")
        if match.filename in used:
            raise ValueError(f"Duplicate audio mapping: {match.filename}")
        used.add(match.filename)
        cover_key = str(Path(match.filename).with_suffix(".jpg"))
        identity = f"{row['artist']}::{row['title']}"
        catalog.append({
            "catalogId": hashlib.sha256(identity.encode()).hexdigest()[:24],
            "title": row["title"],
            "artistName": row["artist"],
            "album": None,
            "pool": row["pool"],
            "manifestSizeBytes": int(row["size_bytes"]),
            "manifestSizeMatchesFile": int(row["size_bytes"]) == match.file_size,
            "audio": asset(match.filename, "audio/mpeg"),
            "artwork": asset(cover_key, "image/jpeg") if cover_key in entries else None,
            "artworkStatus": "original-supplied" if cover_key in entries else "missing",
            "arc": {
                "chainId": 5042002,
                "contract": contract,
                "songId": str(song_ids[identity]),
                "releaseId": str(release_ids[identity]),
                "idProvenance": "local-seeding-checkpoint",
            },
            "beatmap": None,
            "beatmapStatus": "not-supplied",
            "rightsStatus": "not-verified",
            "arkivEntityKey": None,
        })
    assert len(used) == len(audio), "Unmapped audio in ZIP"
    assert len({r["arc"]["songId"] for r in catalog}) == len(catalog)
    assert len({r["arc"]["releaseId"] for r in catalog}) == len(catalog)

result = {
    "schemaVersion": 1,
    "bucket": bucket,
    "region": "ap-northeast-1",
    "prefix": "soundbeats_songs_pack/",
    "manifestKey": manifest,
    "tracks": catalog,
}
out = Path(args.output)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({
    "songs": len(catalog),
    "artists": len({r["artistName"] for r in catalog}),
    "artwork": dict(Counter(r["artworkStatus"] for r in catalog)),
    "output": str(out),
}))
