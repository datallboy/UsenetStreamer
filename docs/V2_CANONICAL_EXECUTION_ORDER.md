# V2 Canonical Execution Order

Source of truth: `docs/v2_github_project_tasks.csv`

This file is a full ordered checklist. Execute tasks in this exact row order.

References:
- Proposal: `docs/V2_PROJECT_PROPOSAL.md`
- Playbook: `docs/V2_EXECUTION_PLAYBOOK.md`
- Server extraction map: `docs/v2-server-extraction-inventory.md`

## M0

1. `V2-000` - Create v2 branch from origin/master
   Objective: Create a new branch named v2 from origin/master so refactor work starts from production code.
2. `V2-001` - Add project labels
   Objective: Create and standardize labels (`v2`, milestone, risk, size, quick-win, rollback).
3. `V2-002` - Create project fields
   Objective: Add project fields: Milestone, Size, Risk, Owner, Status, Rollback Needed.
4. `V2-003` - Add v2 issue template
   Objective: Create issue template with goal, scope, DoD, rollback sections.
5. `V2-010` - Write v1 freeze policy
   Objective: Document that v1 only accepts critical fixes during v2.
6. `V2-011` - Add endpoint smoke script
   Objective: Add script to hit manifest/catalog/meta/stream and report pass/fail.
7. `V2-012` - Capture golden responses
   Objective: Store baseline JSON fixtures for core endpoints.
8. `V2-013` - Add same output CI job
   Objective: Compare responses against fixtures in CI and show diff on failure.
9. `V2-014` - Add latency/error baseline
   Objective: Record basic latency/error metrics before refactor changes.
10. `V2-015` - Write rollback runbook
   Objective: Document how to disable v2 paths and recover quickly.
11. `V2-016` - Create server.js extraction inventory
   Objective: Map large single file sections in `origin/master:server.js` to target layers.
12. `V2-017` - Create services extraction inventory
   Objective: Map all large service files to target layer boundaries and owners.
13. `V2-018` - Publish explicit out-of-scope list
   Objective: Document deferred work (admin UI rewrite, vendor internals) with rationale.
14. `V2-019` - Expand baseline fixture coverage
   Objective: Add fixtures for easynews/nzbdav/integration-client error paths and triage outcomes.
15. `V2-GATE-M0` - M0 gate - baseline ready
   Objective: Close only when smoke, same output, inventory, and rollback docs are complete.

## M1

16. `V2-020` - Add TypeScript base config
   Objective: Create shared TS config with allowJs/checkJs for gradual migration.
17. `V2-021` - Add typecheck scripts
   Objective: Add npm scripts and CI step for type checking.
18. `V2-022` - Create shared API contract types
   Objective: Define request/response DTOs for manifest/catalog/meta/stream.
19. `V2-023` - Type stream context entry points
   Objective: Add JSDoc/TS typing for stream context builder and consumers.
20. `V2-024` - Block new untyped layered files
   Objective: Add guard that no new JS files are added under `src/{routes,controllers,services,integrations,domain}/**`.
21. `V2-025` - Define integration-client interfaces
   Objective: Create typed integration-client contracts for Newznab, NZBDav, Easynews, Indexer, TMDb, TVDb.
22. `V2-026` - Define triage and stream contracts
   Objective: Create typed contracts for triage decisions, statuses, and stream ranking outputs.
23. `V2-027` - Type runtime snapshot model
   Objective: Define typed read-only runtime snapshot consumed by service/controller layers.
24. `V2-028` - Add layer boundary import rules
   Objective: Prevent cross-layer imports that violate layered architecture.
25. `V2-029` - Add TS project references
   Objective: Set TS project references for app/services/integrations/shared for faster checks.
26. `V2-GATE-M1` - M1 gate - TS foundation stable
   Objective: Close only when TS checks and core contracts are stable in CI.

## M2

27. `V2-030` - Create stream layered scaffold
   Objective: Create `src/{routes,controllers,services,integrations,domain}/stream/*` plus `src/types/stream/*` with README.
28. `V2-031` - Define StreamDeps interface
   Objective: Replace giant flat stream context with grouped dependency shape.
29. `V2-032` - Wrap stream flow in use-case factory
   Objective: Introduce `createGetStreamsUseCase(deps)` wrapper with no behavior change.
30. `V2-033` - Move stream route wiring to routes layer
   Objective: Register stream routes via routes index rather than server large single file.
31. `V2-034` - Add stream v2 feature flag
   Objective: Add `STREAM_V2_ENABLED` toggle for safe rollout/rollback.
32. `V2-126` - Extract admin route registration from server.js
   Objective: Move `/admin` and `/admin/api` route registration from server.js into `src/routes/admin/*` registration modules.
33. `V2-127` - Extract admin config handler controller
   Objective: Move `/admin/api/config` GET/POST handler logic from server.js into `src/controllers/admin/configController.*` while preserving hot-reload behavior.
34. `V2-128` - Extract admin connection-test controller
   Objective: Move `/admin/api/test-connections` handler logic from server.js into `src/controllers/admin/connectionTestController.*` with unchanged test semantics.
35. `V2-037` - Extract manifest/catalog/meta handlers
   Objective: Move addon handlers from server.js into controller/service files.
36. `V2-038` - Extract Easynews/NZBDav HTTP handlers
   Objective: Move Easynews NZB and NZBDav stream handlers out of server.js.
37. `V2-039` - Extract bootstrap and route registration
   Objective: Move start/restart lifecycle and route registration out of server.js.
38. `V2-047` - Extract shared helper functions from server.js
   Objective: Move strict-search/encoding/format helpers from server.js to shared utilities.
39. `V2-070` - Split stream use-case internals
   Objective: Break stream flow into request parsing, id resolution, search planning, ranking, output building components.
40. `V2-122` - Extract stream HTTP controller from server.js
   Objective: Move request/response handling for stream endpoints from `server.js` into `src/controllers/stream/*` and keep routing thin.
41. `V2-123` - Extract stream domain rules to domain layer
   Objective: Move pure stream rules (ID normalization/search matching/ranking helpers) into `src/domain/stream/*` with side-effect-free tests.
42. `V2-124` - Extract stream integration adapters
   Objective: Create `src/integrations/stream/*` adapters for indexer/newznab/easynews/nzbdav/tmdb/tvdb calls used by stream flow.
43. `V2-071` - Add stream component unit tests
   Objective: Add tests for each new stream subcomponent plus integration same output checks.
44. `V2-035` - Add stream same output tests
   Objective: Compare legacy and layered stream outputs on fixtures.
45. `V2-129` - Add admin extraction parity tests
   Objective: Add fixture/smoke checks for admin config and connection-test endpoints after extraction to confirm unchanged behavior.
46. `V2-125` - Complete stream layered cutover behind feature flag
   Objective: Wire `routes -> controllers -> services -> domain -> integrations` stream path behind `STREAM_V2_ENABLED` with parity and staged validation.
47. `V2-036` - Run stream staging trial run
   Objective: Enable stream v2 in staging and monitor latency/error rates after M2 extraction tasks are complete.
48. `V2-GATE-M2` - M2 gate - server/admin/stream split work stable
   Objective: Close only when admin+stream controller/domain/integration extraction, same output checks, and staging trial run checks pass.

## M3

49. `V2-040` - Create triage layered scaffold
   Objective: Create `src/{routes,controllers,services,integrations,domain}/triage/*` plus `src/types/triage/*` scaffold.
50. `V2-041` - Define triage decision types
   Objective: Centralize triage statuses and decision payload types.
51. `V2-042` - Extract NNTP adapter interface
   Objective: Abstract NNTP operations behind triage adapter contract.
52. `V2-043` - Extract archive inspection adapter interface
   Objective: Abstract rar/zip/7z inspection dependencies behind interface.
53. `V2-044` - Add triage fixture tests
   Objective: Add fixture tests for critical triage statuses and blockers/warnings.
54. `V2-045` - Add triage same output checker
   Objective: Compare legacy vs refactored triage outputs on fixture case list.
55. `V2-046` - Add triage v2 feature flag
   Objective: Add `TRIAGE_V2_ENABLED` toggle for safe switching.
56. `V2-072` - Split triage/index.js NNTP concerns
   Objective: Move pooling/client/stat/body operations into dedicated infra files.
57. `V2-073` - Split triage archive analyzers
   Objective: Move archive parsing/analyzers into isolated infra/domain modules.
58. `V2-074` - Extract triage decision pipeline
   Objective: Move decision assembly/scoring into app-layer pipeline module.
59. `V2-075` - Extract triage domain helpers
   Objective: Move file/title/archive selection helpers to domain modules.
60. `V2-076` - Isolate RAR/7z/ZIP contracts and tests
   Objective: Define parser contracts and add targeted regression tests for signatures/status transitions.
61. `V2-077` - Create triage compatibility wrapper
   Objective: Keep `src/services/triage/index.js` as thin compatibility wrapper during migration.
62. `V2-078` - Expand triage fixture case list
   Objective: Add fixtures for verified/blocked/unverified_7z/missing-articles/fetch-error and archive edge cases.
63. `V2-104` - Reduce triage/index.js to compatibility wrapper
   Objective: Reduce `src/services/triage/index.js` from large single file to compatibility wrapper target (<=500 lines) after extractions.
64. `V2-GATE-M3` - M3 gate - triage split work stable
   Objective: Close only when triage extraction, same output, and rollback checks pass.

## M4

65. `V2-050` - Create central config service
   Objective: Centralize env parsing and runtime config access in config service.
66. `V2-051` - Add read-only runtime snapshot
   Objective: Use immutable typed runtime snapshot for module execution.
67. `V2-052` - Move admin config update flow
   Objective: Refactor admin save/reload to use central config service and explicit reload steps while preserving no-restart behavior for hot-reloadable settings.
68. `V2-053` - Add config reload smoke tests
   Objective: Test config apply, cache clear, and hot-reload vs restart-required behavior.
69. `V2-054` - Remove scattered process.env reads
   Objective: Restrict direct env reads to config layer only.
70. `V2-055` - Add reload decision logging
   Objective: Log why a config change triggers restart vs hot reload.
71. `V2-056` - Reduce server.js to composition-only
   Objective: Reach target server.js <= 300 lines with no business logic handlers.
72. `V2-057` - Add large single file guard CI check
   Objective: Fail CI if server.js grows beyond threshold or reintroduces handler bodies.
73. `V2-079` - Split newznab service
   Objective: Split `src/services/newznab.js` into configs/caps/search layers with integration-client wrapper.
74. `V2-080` - Split nzbdav service
   Objective: Split `src/services/nzbdav.js` into config/api/webdav/streaming modules with wrapper.
75. `V2-081` - Split easynews service
   Objective: Split `src/services/easynews/index.js` into auth/query/mapper/download modules.
76. `V2-082` - Split tmdb service
   Objective: Split `src/services/tmdb.js` into client/cache/lookup modules with wrapper.
77. `V2-083` - Split indexer service
   Objective: Split `src/services/indexer.js` into manager adapters and planner logic.
78. `V2-084` - Unify service reload coordination
   Objective: Make all integration-client/service reloads flow through config service coordination.
79. `V2-085` - Add integration-client behavior tests
   Objective: Add behavior tests for integration-client wrappers (newznab/nzbdav/easynews/tmdb/indexer/tvdb).
80. `V2-090` - Split tvdb service
   Objective: Split `src/services/tvdb.js` into client/auth/lookup modules with wrapper.
81. `V2-091` - Split metadata parser service
   Objective: Split `src/services/metadata/releaseParser.js` into parser rules/normalization modules.
82. `V2-092` - Split specialMetadata service
   Objective: Move `src/services/specialMetadata.js` to integration-client module with typed wrapper.
83. `V2-093` - Split cache layer
   Objective: Refactor `src/cache/index.js`, `nzbCache.js`, `nzbdavCache.js`, and `streamCache.js` into cohesive cache modules with typed interfaces.
84. `V2-094` - Refactor auth middleware
   Objective: Refactor `src/middleware/auth.js` into typed middleware module with explicit token validation contract.
85. `V2-095` - Consolidate config/runtime utilities
   Objective: Consolidate `config/runtimeEnv.js`, `src/config/constants.js`, and `src/utils/config.js` behind config service + runtime snapshot.
86. `V2-096` - Refactor parser utilities
   Objective: Split `src/utils/parsers.js` into focused utility modules (id parsing, token normalization, stream parsing helpers).
87. `V2-097` - Refactor publish metadata utilities
   Objective: Refactor `src/utils/publishInfo.js` into typed publish metadata domain utility with explicit date-window contracts.
88. `V2-109` - Create structured logger abstraction
   Objective: Introduce `src/observability/logger` with env-configured levels, structured output, and console adapter compatibility.
89. `V2-110` - Add request context middleware
   Objective: Add middleware to attach request ID, start timestamp, and request-scoped logger to request context.
90. `V2-111` - Add centralized HTTP error middleware
   Objective: Introduce layered error mapping middleware for API responses and consistent log/error payloads.
91. `V2-112` - Refactor middleware chain composition
   Objective: Move auth/cors/json/static/security middleware ordering into `src/app/http/middleware` composition module.
92. `V2-113` - Replace mega-context with small grouped dependency objects
   Objective: Replace giant context objects with typed small grouped dependency objects (`appDeps`, `requestDeps`, `featureDeps`).
93. `V2-114` - Add config+logging behavior tests
   Objective: Add tests that verify runtime snapshot injection, config reload behavior, and log redaction of secrets.
94. `V2-115` - Define hot-reload key classification case list
   Objective: Classify runtime settings as hot-reloadable vs restart-required and enforce the case list in admin apply flow.
95. `V2-116` - Implement versioned runtime config store
   Objective: Implement versioned in-memory config store backed by runtime-env persistence so readers use snapshots instead of direct process.env reads.
96. `V2-117` - Guarantee manifest freshness after config save
   Objective: Ensure manifest routes read latest config snapshot immediately and return cache headers that prevent stale manifest usage.
97. `V2-118` - Add no-restart config reload integration tests
   Objective: Add integration tests covering admin-save -> manifest/settings effect without restart for hot-reloadable keys.
98. `V2-120` - Sync runtime env schema and docs
   Objective: Align `.env.example`, admin config key definitions, and runtime config schema docs for all supported settings.
99. `V2-121` - Validate service worker caching for runtime settings
   Objective: Ensure admin PWA/service worker behavior never serves stale addon manifest or config-driven runtime responses.
100. `V2-GATE-M4` - M4 gate - all services split work stable
   Objective: Close only when all major service split work and config hardening are complete.

## M5

101. `V2-060` - Write architecture overview
   Objective: Document final v2 architecture and layered boundaries for contributors.
102. `V2-061` - Add endpoint contribution guide
   Objective: Document step-by-step flow to add a new endpoint in v2.
103. `V2-062` - Add integration-client adapter guide
   Objective: Document how to add a new integration-client adapter safely.
104. `V2-063` - Add v2 PR checklist
   Objective: Create PR checklist for same output/tests/rollback/observability.
105. `V2-064` - Add CODEOWNERS for layers
   Objective: Define layer ownership to improve review flow.
106. `V2-065` - Add integration test template
   Objective: Provide reusable test template for new layered features.
107. `V2-119` - Align build and deployment entrypoints
   Objective: Update `package.json` scripts, TS build outputs, and `Dockerfile` startup path to match refactored runtime layout.
108. `V2-086` - Refactor shared helpers large single file
   Objective: Split `src/utils/helpers.js` into focused shared utility modules.
109. `V2-087` - Refactor connection test utilities
   Objective: Split `src/utils/connectionTests.js` into integration-specific diagnostics.
110. `V2-088` - Add shared testing toolkit
   Objective: Create `src/shared/testing` helpers for fixtures/same output/assertions.
111. `V2-089` - Publish architecture decision records
   Objective: Add ADRs documenting key v2 design decisions and tradeoffs.
112. `V2-098` - Refactor template and user-agent utilities
   Objective: Refactor `src/utils/templateEngine.js` and `src/utils/userAgent.js` into typed shared utility modules with tests.
113. `V2-099` - Harden parse-torrent-title integration boundary
   Objective: Add typed adapter boundary around `src/utils/lib/parse-torrent-title` usage and isolate direct calls to one integration module.
114. `V2-100` - Modularize admin frontend app
   Objective: Split `admin/app.js` into feature-oriented frontend modules (api client, state, views/components, form handlers).
115. `V2-101` - Refactor admin static shell assets
   Objective: Cleanly structure `admin/index.html`, `styles.css`, `sw.js`, and `manifest.json` with documented build/runtime expectations.
116. `V2-102` - Consolidate shared type definitions
   Objective: Establish `src/types` as source of shared global/module types and remove duplicate ad-hoc type declarations.
117. `V2-103` - Refactor project scripts and diagnostics
   Objective: Refactor/standardize `scripts/*` tooling (triage diagnostics/import scripts) with docs and safer defaults.
118. `V2-105` - Create parse-torrent-title subtree strategy
   Objective: Document whether `src/utils/lib/parse-torrent-title` is treated as internal, vendored, or replaceable dependency in v2.
119. `V2-106` - Refactor parse-torrent-title access via wrapper
   Objective: Create a single wrapper module for parse-torrent-title usage and migrate all direct imports to it.
120. `V2-107` - Stabilize parse-torrent-title regression suite
   Objective: Classify and run parser tests relevant to production paths; mark noisy tests and document rationale.
121. `V2-108` - Document parser upgrade and sync process
   Objective: Add contributor guide for updating parser subtree and validating compatibility.
122. `V2-GATE-M5` - M5 gate - contributor readiness complete
   Objective: Close only when docs/templates/checklists/ADRs are complete and usable.

## M0-M5

123. `V2-GATE-ROLLBACK` - Global rollback drill per milestone
   Objective: Run one rollback simulation per milestone and record evidence.

## Gate Verification Commands

Run these before closing any milestone gate:
1. `npm run typecheck`
2. `npm run check:layer-js`
3. `npm run check:layers`
4. `npm run smoke:endpoints`
5. `npm run fixtures:check-core`
6. `npm run test:stream-same-output` (for stream/triage touching slices)
7. `npm run staging:trial` (for M2 staging gate validation)

## Gate Revalidation Note

If scope changes after a gate commit was recorded, re-open that gate task and re-run validation evidence before closing it again.

