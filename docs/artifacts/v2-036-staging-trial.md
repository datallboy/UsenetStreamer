# V2-036 Staging Trial Report

Generated: 2026-02-28T04:38:14.034Z
Samples per case: 3
Result: PASS

## Service Metrics

| Service | Case | Status | Avg (ms) | P95 (ms) | Max (ms) | Failure Rate |
|---|---|---:|---:|---:|---:|---:|
| v1 | manifest | 200 | 16 | 44 | 44 | 0 |
| v1 | catalog | 200 | 3913.67 | 4006 | 4006 | 0 |
| v1 | meta | 404 | 3725 | 3725 | 3725 | 0 |
| v1 | stream-invalid-id | 400 | 2.33 | 3 | 3 | 0 |
| v1 | easynews-nzb | 400 | 1.33 | 2 | 2 | 0 |
| v1 | nzb-stream-missing-params | 400 | 1.33 | 2 | 2 | 0 |
| v2-legacy | manifest | 200 | 1.67 | 2 | 2 | 0 |
| v2-legacy | catalog | 200 | 3663 | 3725 | 3725 | 0 |
| v2-legacy | meta | 404 | 3660.67 | 3724 | 3724 | 0 |
| v2-legacy | stream-invalid-id | 400 | 1.33 | 2 | 2 | 0 |
| v2-legacy | easynews-nzb | 400 | 1.33 | 2 | 2 | 0 |
| v2-legacy | nzb-stream-missing-params | 400 | 1 | 1 | 1 | 0 |
| v2-enabled | manifest | 200 | 1.67 | 2 | 2 | 0 |
| v2-enabled | catalog | 200 | 3604 | 3643 | 3643 | 0 |
| v2-enabled | meta | 404 | 3509.67 | 3531 | 3531 | 0 |
| v2-enabled | stream-invalid-id | 400 | 1 | 1 | 1 | 0 |
| v2-enabled | easynews-nzb | 400 | 1.33 | 2 | 2 | 0 |
| v2-enabled | nzb-stream-missing-params | 400 | 1.33 | 2 | 2 | 0 |

## Parity Checks

| Compare | Case | Transport | Status | Body | Failure Rate | Latency | Overall |
|---|---|---|---|---|---|---|---|
| v2-legacy vs v1 | manifest | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-legacy vs v1 | catalog | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-legacy vs v1 | meta | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-legacy vs v1 | stream-invalid-id | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-legacy vs v1 | easynews-nzb | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-legacy vs v1 | nzb-stream-missing-params | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-enabled vs v2-legacy | manifest | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-enabled vs v2-legacy | catalog | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-enabled vs v2-legacy | meta | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-enabled vs v2-legacy | stream-invalid-id | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-enabled vs v2-legacy | easynews-nzb | PASS | PASS | PASS | PASS | PASS | PASS |
| v2-enabled vs v2-legacy | nzb-stream-missing-params | PASS | PASS | PASS | PASS | PASS | PASS |

## Threshold Notes

- Transport connectivity must succeed for both baseline and candidate (no `fetch failed`).
- Status and normalized response body must match baseline for each case.
- Candidate failure rate must be <= baseline + 0.10.
- Candidate P95 must be <= max(40ms, baseline P95 * 2).
