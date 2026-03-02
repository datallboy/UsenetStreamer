# UsenetStreamer V2 Refactor + TypeScript Project Proposal

Date: 2026-02-25  
Baseline: `origin/master` (`v2` branch)  
Primary owner: solo maintainer + future contributors

## 1) Project Objective
Refactor the production codebase into a modular, typed architecture that is safer to change and easier for new developers to understand.

Primary goals:
1. Break up monolithic runtime paths (`server.js`, `src/services/triage/index.js`, and other large services).
2. Introduce TypeScript incrementally with low regression risk.
3. Add explicit layer boundaries, integration-client interfaces, and rollback controls.
4. Keep production behavior stable using fixtures, parity checks, canaries, and feature flags.
5. Preserve live admin-driven config updates without restart for hot-reloadable settings.

## 2) Strategic Decision
Decision: **incremental refactor on Express + TypeScript**, not full rewrite.

Why:
1. Active user base requires reversible changes.
2. Existing app-level test coverage is not yet strong enough for a big-bang rewrite.
3. Runtime reload/config behavior is complex and best migrated in stages.
4. One-developer execution benefits from milestone gates and quick-win tasks.

## 3) Scope Commitment (Updated)
This proposal now includes **all major code portions** in this repo:
1. `server.js`
2. `admin/*`
3. `config/runtimeEnv.js`
4. `src/cache/*`
5. `src/config/*`
6. `src/middleware/*`
7. `src/services/**/*` (all service files)
8. `src/utils/*`
9. `src/utils/lib/parse-torrent-title/*` (via integration boundary + strategy tasks)
10. `src/types/*`
11. `scripts/*`

Out-of-scope for V2:
1. NestJS migration
2. Full UI redesign beyond modularization and maintainability hardening

## 4) Architecture Target

```text
src/
  app/
    compositionRoot.ts
    createApp.ts
    httpServer.ts
    registerRoutes.ts
    http/
      middleware/
        requestContext.ts
        errorHandler.ts
    config/
      configService.ts
      runtimeSnapshot.ts
  middleware/
    auth/
      ensureSharedSecret.ts
  routes/
    index.ts
    addonRoutes.ts
    adminRoutes.ts
  controllers/
    streamController.ts
    catalogController.ts
    metaController.ts
    healthController.ts
  services/
    stream/
    triage/
    metadata/
  integrations/
    newznab/
    nzbdav/
    easynews/
    tmdb/
    tvdb/
    indexer/
    nntp/
    archive/
  cache/
    repositories/
  observability/
    logger/
      index.ts
      redact.ts
  domain/
    stream/
    triage/
    metadata/
    common/
  types/
    index.ts
    stream.ts
    triage.ts
  shared/
    contracts/
    errors/
    utils/
    testing/
```

Principles:
1. Route handlers stay thin and delegate to controllers/services.
2. Business logic lives in services/domain, not in routes or `server.js`.
3. External side effects are isolated in `src/integrations/*` clients.
4. Typed interfaces define service <-> integration contracts.
5. Immutable runtime snapshots control request-time behavior.
6. Request-scoped dependencies (`requestDeps`) replace giant context payloads.
7. Logging flows through shared logger abstraction with redaction defaults.

## 5) Milestone Plan and Task Alignment

This proposal aligns with `docs/v2_github_project_tasks.csv` as source-of-truth.
Current task count: **123 rows** (116 execution tasks + 7 gates).

## M0 - Baseline + Inventory (15 tasks)
Task IDs:
- `V2-000..V2-003`
- `V2-010..V2-019`
- `V2-GATE-M0`

Outcome:
1. Baseline fixtures/parity checks.
2. Performance baseline.
3. Rollback runbook.
4. Server/services inventory and scope boundaries.

## M1 - TypeScript Foundation (11 tasks)
Task IDs:
- `V2-020..V2-029`
- `V2-GATE-M1`

Outcome:
1. TS toolchain + CI typecheck.
2. Shared API/integration-client contracts.
3. Runtime snapshot typing.
4. Import boundary enforcement.

## M2 - Server + Admin + Stream Decomposition (22 tasks)
Task IDs:
- `V2-030..V2-039`
- `V2-047`
- `V2-070..V2-071`
- `V2-122..V2-129`
- `V2-GATE-M2`

Outcome:
1. Admin + addon + stream route/controller extraction from `server.js`.
2. Stream service/domain/integration extraction with feature-flag safety.
3. `server.js` route/bootstrap extraction.
4. Stream and admin parity checks plus staged rollout controls.
5. High-risk cutovers remain guarded by flags + rollback drill evidence.

## M3 - Triage Decomposition (16 tasks)
Task IDs:
- `V2-040..V2-046`
- `V2-072..V2-078`
- `V2-104`
- `V2-GATE-M3`

Outcome:
1. Triage split into integrations + service pipeline + domain helpers.
2. `triage/index.js` reduced to compatibility adapter target.
3. Triage parity fixture matrix + rollback path.

## M4 - All Services + Runtime Hardening (36 tasks)
Task IDs:
- `V2-050..V2-057`
- `V2-079..V2-097`
- `V2-109..V2-114`
- `V2-115..V2-118`
- `V2-120..V2-121`
- `V2-GATE-M4`

Outcome:
1. Decompose all core services (newznab/nzbdav/easynews/tmdb/tvdb/indexer/metadata/specialMetadata).
2. Move external-client code into integration folders and keep business logic in services/domain.
3. Introduce structured logging, request-context middleware, and centralized HTTP error middleware.
4. Preserve no-restart hot reload for classified settings and immediate manifest freshness after admin saves.
5. Reduce `server.js` to composition-only and enforce via CI guard.

## M5 - Utilities, Admin, Parser Boundary, Contributor Readiness (22 tasks)
Task IDs:
- `V2-060..V2-065`
- `V2-119`
- `V2-086..V2-089`
- `V2-098..V2-103`
- `V2-105..V2-108`
- `V2-GATE-M5`
- `V2-GATE-ROLLBACK`

Outcome:
1. Admin frontend modularization (`admin/app.js` and shell assets).
2. Utility monolith decomposition (`helpers.js`, `connectionTests.js`, template/user-agent).
3. Build/deployment entrypoint alignment for local + container runtime.
4. `parse-torrent-title` strategy + integration wrapper + regression suite/process docs.
5. Shared types/testing/docs/ADRs for onboarding.

## 6) Codebase Coverage Matrix (Traceability)

| Code Area | Coverage Tasks |
|---|---|
| `server.js` | `V2-016`, `V2-126`, `V2-127`, `V2-128`, `V2-037`, `V2-038`, `V2-039`, `V2-047`, `V2-122`, `V2-125`, `V2-056`, `V2-057`, `V2-115`, `V2-117` |
| `src/routes/admin/*` | `V2-126`, `V2-129`, `V2-112` |
| `src/controllers/admin/*` | `V2-127`, `V2-128`, `V2-129` |
| `src/controllers/stream/*` | `V2-030`, `V2-122`, `V2-125` |
| `src/domain/stream/*` | `V2-030`, `V2-070`, `V2-071`, `V2-123`, `V2-125` |
| `src/integrations/stream/*` | `V2-030`, `V2-124`, `V2-125`, `V2-085` |
| `admin/app.js` | `V2-100` |
| `admin/index.html`, `styles.css`, `sw.js`, `manifest.json` | `V2-101`, `V2-121` |
| `config/runtimeEnv.js` | `V2-095`, `V2-115`, `V2-116`, `V2-117` |
| `src/cache/*` | `V2-093` |
| `src/config/constants.js` | `V2-095` |
| `src/middleware/auth.js` | `V2-094`, `V2-112` |
| `src/services/triage/index.js`, `runner.js` | `V2-040..046`, `V2-072..078`, `V2-104` |
| `src/services/newznab.js` | `V2-079` |
| `src/services/nzbdav.js` | `V2-080` |
| `src/services/easynews/index.js` | `V2-081` |
| `src/services/tmdb.js` | `V2-082` |
| `src/services/tvdb.js` | `V2-090` |
| `src/services/indexer.js` | `V2-083` |
| `src/services/metadata/releaseParser.js` | `V2-091` |
| `src/services/specialMetadata.js` | `V2-092` |
| `src/utils/config.js` | `V2-095` |
| `src/utils/parsers.js` | `V2-096` |
| `src/utils/publishInfo.js` | `V2-097` |
| `src/utils/helpers.js` | `V2-086` |
| `src/utils/connectionTests.js` | `V2-087` |
| `src/utils/templateEngine.js`, `src/utils/userAgent.js` | `V2-098` |
| `src/utils/lib/parse-torrent-title/*` | `V2-099`, `V2-105`, `V2-106`, `V2-107`, `V2-108` |
| `src/types/*` | `V2-102` |
| `scripts/*` | `V2-103` |
| Root build/runtime files (`package.json`, `Dockerfile`, `.env.example`) | `V2-119`, `V2-120` |
| Cross-cutting logging + request middleware in `server.js` and services | `V2-109`, `V2-110`, `V2-111`, `V2-112`, `V2-113`, `V2-114` |
| Admin save/apply hot-reload workflow and config persistence (`/admin/api/config`, `config/runtimeEnv.js`) | `V2-052`, `V2-053`, `V2-055`, `V2-095`, `V2-115`, `V2-116`, `V2-117`, `V2-118`, `V2-120` |

## 6.1) Folder Rules (Implementation Guidance)
1. `routes` only map URL paths to controller handlers.
2. `controllers` handle HTTP request/response shape only.
3. `services` hold application orchestration and business rules.
4. `integrations` wrap Easynews/Newznab/NZBDav/TMDb/TVDb/Indexer/NNTP/archive dependencies.
5. `cache/repositories` owns cache read/write policy and key strategy.
6. `domain` contains pure decision/ranking/parsing logic.
7. `app` owns composition/bootstrap/route registration.
8. `middleware` contains reusable HTTP middleware units; ordering is composed in `app/http/middleware`.
9. `observability/logger` owns log formatting, correlation IDs, and redaction.
10. Dependencies are passed via scoped bags: `appDeps` (singletons), `requestDeps` (per-request), `featureDeps` (per-domain).

## 7) Timeline Guidance
Estimated duration for one primary developer:
1. M0: 1.5 weeks
2. M1: 1.5 weeks
3. M2: 5 weeks
4. M3: 3 weeks
5. M4: 6 weeks
6. M5: 3.5 weeks

Planned: ~20.5 weeks  
Buffer for hotfix interruptions: +2 to +3 weeks  
Total range: **23-24 weeks**.

## 8) Rollout and Safety Controls
1. Feature flags for risky cutovers (`STREAM_V2_ENABLED`, `TRIAGE_V2_ENABLED`, integration-client toggles as needed).
2. Fixture/parity checks in CI before gate closure.
3. Staging canaries for high-risk paths.
4. Mandatory rollback drill evidence for each milestone gate.
5. Hot-reload parity checks ensure admin config changes apply without restart for hot-reloadable keys.

## 9) Deliverables Artifacts
1. Proposal: `docs/V2_PROJECT_PROPOSAL.md`
2. Task source-of-truth: `docs/v2_github_project_tasks.csv`
3. Canonical ordered checklist: `docs/V2_CANONICAL_EXECUTION_ORDER.md`
4. Server extraction map: `docs/v2-server-extraction-inventory.md`
5. Gate evidence artifacts under `docs/artifacts/*`

## 10) Immediate Next Steps
1. Execute tasks in canonical row order from `docs/V2_CANONICAL_EXECUTION_ORDER.md`.
2. Keep M2 scope explicit: layered stream path behind `STREAM_V2_ENABLED` + parity/staging checks.
3. Treat physical extraction/removal of remaining legacy stream handler body as `V2-056` (M4) scope.
4. Enforce milestone gates strictly to preserve production safety.

<!-- TASK_ID_APPENDIX_START -->
## 11) Exact Task ID Inventory (CSV Alignment)
This appendix mirrors `docs/v2_github_project_tasks.csv` exactly so proposal and CSV stay aligned.

### M0 (15 tasks)
V2-000, V2-001, V2-002, V2-003, V2-010, V2-011, V2-012, V2-013, V2-014, V2-015, V2-016, V2-017, V2-018, V2-019, V2-GATE-M0

### M1 (11 tasks)
V2-020, V2-021, V2-022, V2-023, V2-024, V2-025, V2-026, V2-027, V2-028, V2-029, V2-GATE-M1

### M2 (22 tasks)
V2-030, V2-031, V2-032, V2-033, V2-034, V2-126, V2-127, V2-128, V2-037, V2-038, V2-039, V2-047, V2-070, V2-122, V2-123, V2-124, V2-071, V2-035, V2-129, V2-125, V2-036, V2-GATE-M2

### M3 (16 tasks)
V2-040, V2-041, V2-042, V2-043, V2-044, V2-045, V2-046, V2-072, V2-073, V2-074, V2-075, V2-076, V2-077, V2-078, V2-104, V2-GATE-M3

### M4 (36 tasks)
V2-050, V2-051, V2-052, V2-053, V2-054, V2-055, V2-056, V2-057, V2-079, V2-080, V2-081, V2-082, V2-083, V2-084, V2-085, V2-090, V2-091, V2-092, V2-093, V2-094, V2-095, V2-096, V2-097, V2-109, V2-110, V2-111, V2-112, V2-113, V2-114, V2-115, V2-116, V2-117, V2-118, V2-120, V2-121, V2-GATE-M4

### M5 (22 tasks)
V2-060, V2-061, V2-062, V2-063, V2-064, V2-065, V2-086, V2-087, V2-088, V2-089, V2-098, V2-099, V2-100, V2-101, V2-102, V2-103, V2-105, V2-106, V2-107, V2-108, V2-119, V2-GATE-M5

### M0-M5 (1 tasks)
V2-GATE-ROLLBACK

<!-- TASK_ID_APPENDIX_END -->
