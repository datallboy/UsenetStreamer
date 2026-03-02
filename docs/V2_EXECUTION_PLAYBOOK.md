# V2 Step-By-Step Execution Playbook

Date: 2026-02-26  
Use this with: `docs/V2_PROJECT_PROPOSAL.md`, `docs/v2_github_project_tasks.csv`, and `docs/V2_CANONICAL_EXECUTION_ORDER.md`

## 1) Goal
Ship the V2 refactor safely by doing small changes in order, keeping behavior the same, and preserving hot-reload settings from the admin UI.

## 2) Working Rules
1. Work from `v2` branch baseline.
2. One small feature branch per task group.
3. Keep PRs small (prefer 1-4 files when possible).
4. Do not change behavior unless the task says to.
5. Keep no-restart config updates working for hot-reloadable settings.

## 3) Target Folder Structure
Follow this structure as you move code out of `server.js` and large service files.

```text
src/
  app/
    createApp.ts
    registerRoutes.ts
    http/
      middleware/
        requestContext.ts
        errorHandler.ts
    config/
      configService.ts
      runtimeSnapshot.ts
  routes/
    addonRoutes.ts
    adminRoutes.ts
  controllers/
    streamController.ts
    catalogController.ts
    metaController.ts
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
  middleware/
    auth/
      ensureSharedSecret.ts
  observability/
    logger/
      index.ts
      redact.ts
  domain/
    stream/
    triage/
    metadata/
    common/
  shared/
    testing/
  types/
    index.ts
```

## 4) Dependency Injection Model (Simple)
Use three dependency objects instead of one giant context.

1. `appDeps`: long-lived singletons (logger, config service, integration clients, caches).
2. `requestDeps`: per-request values (requestId, request logger, runtime snapshot, auth token).
3. `featureDeps`: only what one feature/use-case needs.

## 5) Execution Path (Do In This Order)

## Step A - Baseline and Safety (M0)
Tasks: `V2-000..019`, `V2-GATE-M0`

1. Create/fetch `v2` from production baseline.
2. Add smoke checks for core endpoints (`manifest`, `catalog`, `meta`, `stream`).
3. Capture baseline responses as fixtures.
4. Add CI check for response diffs.
5. Write rollback runbook before refactor PRs.
6. Build inventory docs for `server.js` and major services.

Done when:
1. CI baseline is green.
2. Rollback doc exists and was reviewed.
3. You can detect behavior changes before shipping.

## Step B - TypeScript Foundation (M1)
Tasks: `V2-020..029`, `V2-GATE-M1`

1. Create root `tsconfig.json` (gradual migration, `allowJs`, `checkJs`, `noEmit`).
2. Add `typecheck` script in `package.json`.
3. Define shared API types and stream/triage types in `src/types`.
4. Add rules that block bad cross-layer imports.
5. Add guard to block new untyped files in target layered folders.

Done when:
1. `npm run typecheck` works locally and in CI.
2. New code must follow layer boundaries.

## Step C - Server/Admin/Stream Extraction (M2)
Tasks: `V2-030..039`, `V2-047`, `V2-070..071`, `V2-122..129`, `V2-GATE-M2`

Process (risk order):
1. Lay stream scaffold/deps/route entry (`V2-030..034`).
2. Extract admin route registration + admin controllers from `server.js` (`V2-126..128`).
3. Keep addon extraction slices in routes/controllers (`V2-037`, `V2-038`).
4. Keep bootstrap/route composition extraction (`V2-039`) and helper extraction (`V2-047`).
5. Split stream internals and layered stream path (`V2-070`, `V2-122..125`, `V2-071`).
6. Run parity tests for stream/admin and staged validation (`V2-035`, `V2-129`, `V2-036`).
7. Close gate only after rollback evidence (`V2-GATE-M2`).

Done when:
1. `server.js` no longer owns admin or stream handler bodies.
2. Stream path runs through `routes -> controllers -> services -> domain -> integrations` behind `STREAM_V2_ENABLED`.
3. Admin and stream parity checks plus staging trial pass.

## Step D - Triage Path Migration (M3)
Tasks: `V2-040..046`, `V2-072..078`, `V2-104`, `V2-GATE-M3`

Create/move in this order:
1. `src/services/triage/*` app-level orchestration
2. `src/domain/triage/*` pure decision helpers
3. `src/integrations/nntp/*` and `src/integrations/archive/*`
4. keep `src/services/triage/index.js` as thin compatibility wrapper during migration

Process:
1. Extract NNTP pooling/client code.
2. Extract archive parsing/analyzer code.
3. Extract decision pipeline.
4. Add fixture matrix and same-output checker.
5. Keep `TRIAGE_V2_ENABLED` flag.

Done when:
1. `triage/index.js` is thin.
2. Same-output checks pass for triage statuses.

## Step E - App Runtime Hardening + Service Decomposition (M4)
Tasks: `V2-050..057`, `V2-079..097`, `V2-109..118`, `V2-120..121`, `V2-GATE-M4`

Implementation groups:
1. App/config/logging/middleware skeleton (`V2-050`, `V2-051`, `V2-109..114`).
2. Hot-reload/runtime config hardening (`V2-052..055`, `V2-095`, `V2-115..118`, `V2-120`, `V2-121`).
3. Full service decomposition (`V2-079..085`, `V2-090..093`, `V2-096..097`).
4. Final `server.js` composition-only target + guard (`V2-056`, `V2-057`).

Done when:
1. Runtime hot-reload behavior is preserved and tested.
2. Core large services are modularized behind integration/service/domain boundaries.
3. `server.js` remains composition-only and guard is active.

## Step F - Admin Frontend, Utilities, Parser Boundary, Docs (M5)
Tasks: `V2-060..065`, `V2-086..089`, `V2-098..103`, `V2-105..108`, `V2-119`, `V2-GATE-M5`

1. Split `admin/app.js` into feature modules.
2. Refactor large utility files (`helpers`, `connectionTests`, template/userAgent).
3. Isolate parse-torrent-title behind one wrapper.
4. Align `package.json` and `Dockerfile` runtime entrypoints.
5. Update docs/checklists for contributor onboarding.

Done when:
1. Team can add a feature by following docs.
2. Runtime start path is clear and consistent.

## 6) First 10 Starter PRs (Recommended)
If you want a simple start order, do these first:

1. PR-01: `V2-020`, `V2-021` (TS base + scripts)
2. PR-02: `V2-011`, `V2-012`, `V2-013` (smoke + fixtures + CI)
3. PR-03: `V2-030`, `V2-031`, `V2-033` (stream scaffolding + deps + routes)
4. PR-04: `V2-126`, `V2-127` (admin routes + config controller extraction)
5. PR-05: `V2-128`, `V2-037`, `V2-038` (admin connection-test + addon/download handlers)
6. PR-06: `V2-039`, `V2-047` (bootstrap + shared helper extraction)
7. PR-07: `V2-070`, `V2-122`, `V2-123` (stream split + controller/domain extraction)
8. PR-08: `V2-124`, `V2-071`, `V2-035`, `V2-129` (stream integrations + parity tests)
9. PR-09: `V2-125`, `V2-036`, `V2-GATE-M2` (cutover + staging + gate revalidation)
10. PR-10: `V2-040`, `V2-042`, `V2-072` (triage scaffolding + NNTP extraction)

## 7) What To Verify On Every PR
1. App still starts.
2. `manifest` reflects current settings.
3. Core smoke endpoints still respond.
4. No secret values leaked in logs.
5. Rollback path exists for risky PRs.

## 8) If You Are Stuck
1. Pause and write what changed and what failed.
2. Reduce scope to one file or one function.
3. Add a compatibility wrapper and continue.
4. Do not force large rewrites in one PR.
