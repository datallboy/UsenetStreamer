# V2 Latency/Error Baseline

Generated: 2026-02-27T17:31:08.369Z
Profile: native-smoke
Sample count per endpoint: 10

| Endpoint | Expected | Avg (ms) | P50 (ms) | P95 (ms) | Max (ms) | Error Rate |
|---|---:|---:|---:|---:|---:|---:|
| manifest | 200 | 1.97 | 2.03 | 2.72 | 2.72 | 0 |
| catalog | 404 | 1.3 | 1.23 | 1.83 | 1.83 | 0 |
| meta | 404 | 1.02 | 1.05 | 1.49 | 1.49 | 0 |
| stream | 400 | 1.5 | 0.99 | 5.88 | 5.88 | 0 |

Notes:
- Baseline uses deterministic native profile (no external providers).
- Non-200 responses for catalog/meta/stream are expected in this profile.
- Treat this as a trend baseline; recapture when endpoint contracts change.

