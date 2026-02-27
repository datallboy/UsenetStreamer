# V2 Local Staging (v1 vs v2)

Use this for `V2-036` staging trial runs without self-hosted runners.

## 1) Build both images

Build v1 image from `master` (or a known-good baseline commit):

```bash
git checkout master
git pull
docker build -t usenetstreamer:staging-v1 .
```

Build v2 image from `v2`:

```bash
git checkout v2
git pull
docker build -t usenetstreamer:staging-v2 .
```

## 2) Prepare shared config

```bash
cp config/staging.common.env.example config/staging.common.env
```

Fill `config/staging.common.env` with the same integration settings you want both services to use.

## 3) Set image tags and start both services

```bash
export STAGING_V1_IMAGE=usenetstreamer:staging-v1
export STAGING_V2_IMAGE=usenetstreamer:staging-v2
# Optional: start v2 with legacy path first
# export STAGING_V2_STREAM_V2_ENABLED=false

docker compose -f docker-compose.staging.yml up -d
```

Services:

- v1: `http://127.0.0.1:17001`
- v2: `http://127.0.0.1:17002`

## 4) Quick checks

If no addon secret is set:

```bash
curl -s http://127.0.0.1:17001/manifest.json | jq '.id,.version'
curl -s http://127.0.0.1:17002/manifest.json | jq '.id,.version'
```

If `ADDON_SHARED_SECRET` is set, use tokenized paths:

```bash
TOKEN="<your-secret>"
curl -s "http://127.0.0.1:17001/${TOKEN}/manifest.json" | jq '.id,.version'
curl -s "http://127.0.0.1:17002/${TOKEN}/manifest.json" | jq '.id,.version'
```

## 5) V2-036 trial guidance

1. Keep `staging-v1` as control.
2. Run `staging-v2` with `STREAM_V2_ENABLED=false` first.
3. Flip `STREAM_V2_ENABLED=true` for `staging-v2` and repeat checks.
4. Compare stream responses, errors, and latency trends against v1 baseline.
5. Roll back v2 quickly by setting `STREAM_V2_ENABLED=false` and recreating `staging-v2`.

## 6) Tear down

```bash
docker compose -f docker-compose.staging.yml down
```

Per-service runtime env state is stored under:

- `out/staging/v1`
- `out/staging/v2`

Delete those directories if you want a clean config state.
