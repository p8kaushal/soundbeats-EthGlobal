# Arkiv schema

Schema name: `soundbeats.ethglobal.tracks.v1`

Each entity represents a published Soundbeats level. The server wallet `0xf5D6dd74586be3a2C95D29E33226821f6fD0d8d8` owns the entities. Entities expire after 180 days and can be extended.

Indexed fields are `trackId`, `source`, `beatmapSource`, and `difficulty`. Display fields are `title`, `creator`, `audioUrl`, and `beatmapUrl`. The `metadata` byte field contains the same public record as JSON, including format, duration when known, BPM, note count, and timestamps.

Audio, images, World results, private keys, and API credentials are excluded. The catalog queries this schema and filters by the configured owner wallet.
