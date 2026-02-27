# V2 Server Extraction Inventory (V2-016)

Source file: `server.js` (3871 lines)
Baseline: `v2` branch aligned with `origin/master` behavior

## Goal
Map major `server.js` sections to target layers so extraction work can happen in small, low-risk PRs.

## Extraction Map

| Source Range | Current Responsibility | Target Layer/Module | Extraction Notes |
|---|---|---|---|
| `1-73` | Process bootstrap, imports, service wiring | `src/app/compositionRoot.ts` | Move all service construction/import wiring into composition root; keep startup side-effects isolated. |
| `74-138` | Shared helper utilities and prefetch cache lifecycle | `src/services/stream/prefetch/*` + `src/domain/stream/*` | Keep pure helpers in `domain`; keep mutable prefetch map in service layer. |
| `139-354` | Admin API handlers (`/admin/api/config`, `/admin/api/test-connections`) | `src/routes/adminRoutes.ts` + `src/controllers/admin/*` + `src/services/config/*` | Split request parsing from config persistence and connection-test orchestration. |
| `355-383` | Admin/static/auth middleware registration | `src/app/registerRoutes.ts` + `src/app/http/middleware/*` | Compose middleware order centrally; avoid inline auth wrappers in `server.js`. |
| `384-745` | Runtime snapshot variables, sorting/triage/indexer state holders, support functions | `src/app/config/runtimeSnapshot.ts` + `src/app/config/configService.ts` | Replace many top-level mutable vars with typed config service + immutable request snapshots. |
| `746-941` | `rebuildRuntimeConfig`, runtime refresh side-effects, ADMIN config keys | `src/app/config/configService.ts` | Keep one hot-reload apply path; expose typed read/apply methods used by controllers. |
| `942-1196` | Query override parsing, indexer/newznab orchestration helpers, stream cache key helpers | `src/services/stream/query/*` + `src/services/stream/search/*` + `src/domain/stream/*` | Keep network orchestration in services; move pure key/build logic into domain utilities. |
| `1208-1351` | Addon handlers: manifest, catalog, meta | `src/routes/addonRoutes.ts` + `src/controllers/{manifest,catalog,meta}Controller.ts` + `src/services/{catalog,meta}/*` | Keep HTTP shaping in controllers; keep NZBDav lookup logic in services. |
| `1353-3635` | Main stream pipeline (ID normalization, manager/newznab/easynews searches, triage ranking, response shaping) | `src/controllers/streamController.ts` + `src/services/stream/*` + `src/domain/stream/*` + `src/integrations/*` | Highest-risk extraction; split by pipeline stage and protect with `STREAM_V2_ENABLED` + same-output fixtures. |
| `3636-3825` | Easynews NZB and NZBDav stream proxy endpoints | `src/controllers/{easynews,nzbdav}Controller.ts` + `src/integrations/{easynews,nzbdav}/*` | Treat as integration-client endpoints; keep request validation in controllers. |
| `3826-3871` | HTTP server lifecycle + startup Newznab caps warmup | `src/app/httpServer.ts` + `src/app/startupTasks.ts` | Isolate startup tasks for easier testing and rollback of startup behaviors. |

## Dependency Boundaries to Preserve

- `routes -> controllers -> services -> integrations`
- `domain` functions remain side-effect free.
- `config/runtimeEnv.js` remains source of truth for hot reload until dedicated config store is complete.
- `server.js` should become composition-only (no business logic) by end of extraction milestones.

## Risk Order (Recommended)

1. Extract admin routes/controllers first (`139-383`).
2. Extract manifest/catalog/meta handlers (`1208-1351`).
3. Extract easynews/nzbdav direct endpoints (`3636-3825`).
4. Extract stream pipeline in stages (`1353-3635`) with fixture parity checks at each PR.

## Verification Requirements per Slice

- `npm run type-check`
- `npm run check:layer-js`
- `npm run check:layers`
- `npm run smoke:endpoints`
- `npm run fixtures:check-core`
- `npm run test:stream-same-output` (required for stream-related slices)
