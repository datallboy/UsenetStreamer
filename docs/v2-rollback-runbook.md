# V2 Rollback Runbook (V2-015)

## Purpose
Provide a fast, low-risk rollback path for v2 behavior changes.

## Scope
This runbook currently covers the active v2 toggle:

- `STREAM_V2_ENABLED`

Future milestones should add runbook sections for new toggles (for example `TRIAGE_V2_ENABLED` once introduced).

## Rollback Trigger Conditions
Rollback immediately when any of these occur after enabling v2 path(s):

- Endpoint smoke checks fail (`manifest`, `catalog`, `meta`, `stream`).
- Golden fixture parity check fails.
- Elevated 5xx rates or malformed stream payloads in production telemetry.
- User-facing regression reports for stream resolution/order/metadata.

## Fast Rollback Procedure
1. Set `STREAM_V2_ENABLED=false` in runtime config (`config/runtimeEnv.js` via admin config save flow).
2. Apply runtime env (`runtimeEnv.applyRuntimeEnv()`) through existing admin save flow.
3. Confirm runtime snapshot reflects rollback state (`streamV2Enabled: false`).
4. Run verification checks:
   - `npm run smoke:endpoints`
   - `npm run fixtures:check-core`
5. If checks fail, stop rollout and keep legacy flag state until fixed.

## Forward/Re-enable Procedure
Only re-enable after fixes are merged and validated:

1. Set `STREAM_V2_ENABLED=true`.
2. Re-run:
   - `npm run smoke:endpoints`
   - `npm run fixtures:check-core`
3. Continue rollout only when both pass.

## M0 Rollback Drill Evidence (2026-02-27)

Environment:

- Branch: `v2`
- Profile: native baseline
- Commands executed from repo root

| Toggle State | Command | Result |
|---|---|---|
| `STREAM_V2_ENABLED=false` | `npm run smoke:endpoints` | PASS (4/4) |
| `STREAM_V2_ENABLED=false` | `npm run fixtures:check-core` | PASS |
| `STREAM_V2_ENABLED=true` | `STREAM_V2_ENABLED=true npm run smoke:endpoints` | PASS (4/4) |
| `STREAM_V2_ENABLED=true` | `STREAM_V2_ENABLED=true npm run fixtures:check-core` | PASS |

Outcome:

- Rollback path is functional.
- Legacy and v2-flagged stream routing produced equivalent behavior for baseline fixtures.

## Ownership
- Primary owner: v2 branch maintainer.
- Update this runbook before each milestone gate if a rollback drill reveals gaps.
