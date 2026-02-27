# V2 Local Staging (Automated v1/v2 Matrix)

Use this for `V2-036` trial runs without self-hosted runners.

## Why 3 containers

Run all three side-by-side so you can isolate differences quickly:

- `staging-v1` (control): master behavior
- `staging-v2-legacy` (same v2 code, `STREAM_V2_ENABLED=false`)
- `staging-v2` (same v2 code, `STREAM_V2_ENABLED=true`)

This tells you whether a regression comes from code drift (`v1` vs `v2`) or from the v2 feature path (`v2-legacy` vs `v2-enabled`).

## Prerequisite

Copy your production runtime env file to:

- `config/runtime-env.json`

The staging script uses that file as source of truth and writes per-container copies under `out/staging/*/config/runtime-env.json` with local overrides:

- `PORT=7000`
- `ADDON_BASE_URL` set to each local service URL
- `STREAM_V2_ENABLED` set per service

## One-command workflow

Start (build + seed + run):

```bash
scripts/staging-local.sh up
```

Stop and remove containers:

```bash
scripts/staging-local.sh down
```

Restart stack:

```bash
scripts/staging-local.sh restart
```

Status/logs:

```bash
scripts/staging-local.sh status
scripts/staging-local.sh logs
scripts/staging-local.sh logs staging-v2
```

Optional shortcuts:

```bash
scripts/staging-local.sh build
scripts/staging-local.sh seed
scripts/staging-local.sh up --skip-build
```

## Local endpoints

- v1 control: `http://127.0.0.1:17001`
- v2 legacy mode: `http://127.0.0.1:17002`
- v2 enabled mode: `http://127.0.0.1:17003`

If `ADDON_SHARED_SECRET` is set, use tokenized paths:

- `/<token>/manifest.json`
- `/<token>/stream/:type/:id.json`

## Ref selection (optional)

Defaults:

- `STAGING_V1_REF=master`
- `STAGING_V2_REF=v2`

Override per run:

```bash
STAGING_V1_REF=origin/master STAGING_V2_REF=HEAD scripts/staging-local.sh up
```

## V2-036 trial checklist

1. Run `scripts/staging-local.sh up`.
2. Verify `manifest` and key stream requests on all 3 services.
3. Compare response parity and error/latency trends.
4. If v2-enabled regresses, keep using v2-legacy (or v1) and investigate.
