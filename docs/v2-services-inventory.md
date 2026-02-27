# V2 Services Extraction Inventory (V2-017)

Source scope: `src/services/**/*`

## Goal
Map every service module to the target layered structure and identify an initial owner for extraction/maintenance.

## Ownership Convention
- `Owner (Current)`: current maintainer role responsible for merge decisions.
- `Owner (Target)`: recommended owning area after extraction (can still be one person, but with clear responsibility boundaries).

## Inventory

| Source File | Lines | Current Responsibility | Target Modules | Owner (Current) | Owner (Target) |
|---|---:|---|---|---|---|
| `src/services/triage/index.js` | 3319 | NNTP pool lifecycle, NZB parse/decode, archive inspection, decision building | `src/integrations/nntp/*`, `src/integrations/archive/*`, `src/services/triage/pipeline/*`, `src/domain/triage/*` | Core maintainer | Triage subsystem owner |
| `src/services/triage/runner.js` | 466 | Candidate selection, timeout/concurrency orchestration, outcome summarization | `src/services/triage/runner/*`, `src/domain/triage/ranking/*` | Core maintainer | Triage subsystem owner |
| `src/services/newznab.js` | 989 | Newznab config parsing, caps cache, search dispatch, normalization | `src/integrations/newznab/client/*`, `src/services/newznab/search/*`, `src/services/newznab/config/*` | Core maintainer | Integrations owner (Newznab) |
| `src/services/nzbdav.js` | 912 | NZBDav API calls, queue/history operations, WebDAV selection, stream proxying | `src/integrations/nzbdav/api/*`, `src/integrations/nzbdav/webdav/*`, `src/services/streaming/nzbdav/*` | Core maintainer | Integrations owner (NZBDav) |
| `src/services/easynews/index.js` | 665 | Easynews search client, credential handling, payload/token helpers | `src/integrations/easynews/client/*`, `src/services/easynews/search/*`, `src/domain/metadata/title-normalization/*` | Core maintainer | Integrations owner (Easynews) |
| `src/services/tmdb.js` | 651 | TMDb client, metadata lookup/localization, cache | `src/integrations/tmdb/client/*`, `src/services/metadata/tmdb/*` | Core maintainer | Metadata owner |
| `src/services/indexer.js` | 383 | Prowlarr/NZBHydra search execution and normalization | `src/integrations/indexer/prowlarr/*`, `src/integrations/indexer/nzbhydra/*`, `src/services/indexer/orchestration/*` | Core maintainer | Integrations owner (Indexer) |
| `src/services/metadata/releaseParser.js` | 280 | Release title parsing and language/quality extraction | `src/domain/metadata/release-parser/*` | Core maintainer | Metadata owner |
| `src/services/tvdb.js` | 155 | TVDb auth and ID mapping calls | `src/integrations/tvdb/client/*`, `src/services/metadata/tvdb/*` | Core maintainer | Metadata owner |
| `src/services/specialMetadata.js` | 57 | Special provider metadata fetch | `src/integrations/special-provider/client/*`, `src/services/metadata/special-provider/*` | Core maintainer | Metadata owner |
| `src/services/stream/getStreamsUseCase.js` | 21 | Stream use-case wrapper (v2 scaffolding) | `src/services/stream/use-cases/getStreams.ts` | Core maintainer | Stream subsystem owner |

## Extraction Order (Risk-First)

1. `triage/index.js` and `triage/runner.js` (largest and highest complexity).
2. `newznab.js` and `nzbdav.js` (high external dependency surface).
3. `easynews/index.js`, `tmdb.js`, `indexer.js`.
4. `metadata/releaseParser.js`, `tvdb.js`, `specialMetadata.js`.
5. Finalize `stream/getStreamsUseCase` as typed use-case entrypoint.

## Boundary Rules

- External I/O belongs in `src/integrations/*`.
- Application orchestration belongs in `src/services/*`.
- Deterministic logic and ranking/parsing belongs in `src/domain/*`.
- Controllers/routes must never import integration clients directly.

## Verification for Each Service Extraction PR

- `npm run type-check`
- `npm run check:layer-js`
- `npm run check:layers`
- `npm run fixtures:check-core`
- `npm run test:stream-same-output` for stream/triage touching changes
