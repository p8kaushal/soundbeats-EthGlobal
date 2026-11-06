# Hackathon server deployment

The public origin is `https://ethglobal.soundbeats.io`. Nginx already proxies it to `127.0.0.1:3000`. The beatmap engine listens privately on `127.0.0.1:4100`.

## One-time checks

```sh
node --version              # must be 22.10 or newer
command -v node
command -v npm
curl http://127.0.0.1:4100/healthz
```

Clone or update the repository, checkout the partner integration branch, then run `npm ci` and `npm run build`.

Create `/home/ubuntu/secrets/app.env` with only the remaining application values:

```text
GEMINI_API_KEY=
BEATMAP_ENGINE_URL=http://127.0.0.1:4100
BEATMAP_ENGINE_TOKEN=
PUBLIC_BASE_URL=https://ethglobal.soundbeats.io
NODE_ENV=production
PORT=3000
WORLD_CLIENT_ID=57dbfe35-6a2b-478e-ac11-1d2f4230750d
WORLD_ISSUER=https://auth.world.org
WORLD_REDIRECT_URI=https://ethglobal.soundbeats.io/api/auth/world/callback
```

World and Arkiv secrets remain in `/home/ubuntu/secrets/world.env` and `/home/ubuntu/secrets/arkiv.env`. Ensure the files contain plain `NAME=value` entries readable by the service user.

Install `deploy/soundbeats-ethglobal.service` as `/etc/systemd/system/soundbeats-ethglobal.service`, adjust the Node/npm paths if `command -v` reports different paths, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now soundbeats-ethglobal
sudo systemctl status soundbeats-ethglobal
curl http://127.0.0.1:3000/api/config
curl https://ethglobal.soundbeats.io/api/config
```

Do not print secret files into logs or shell history. Verify World success and cancellation, live generation, real beatmap generation, Arkiv publish/catalog read, audio seeking, and download from a second device.
