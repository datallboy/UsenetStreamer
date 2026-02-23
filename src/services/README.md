# Services Map

This folder contains business logic used by the HTTP controllers.

## Entry points
- `src/services/stream/streamRequestService.js`: core stream search/triage response flow.
- `src/services/stream/nzbdavStreamRequestService.js`: NZBDav proxy stream flow.
- `src/services/stream/easynewsNzbRequestService.js`: Easynews NZB download flow.

## Search / Provider Services
- `src/services/indexer.js`: indexer-manager plan execution.
- `src/services/newznab.js`: direct Newznab endpoint handling and caps/search orchestration.
- `src/services/easynews/index.js`: Easynews auth/query/download behavior.
- `src/services/nzbdav.js`: NZBDav queue/history/webdav streaming integration.

## Metadata Services
- `src/services/tmdb.js`: TMDb lookup/mapping/search utilities.
- `src/services/tvdb.js`: TVDB lookup/mapping utilities.
- `src/services/specialMetadata.js`: special provider metadata lookup.

## Triage Services
- `src/services/triage/index.js`: triage pipeline + NNTP pooling + archive decision integration.
- `src/services/triage/runner.js`: triage execution strategy/orchestration.

## Notes
- Controllers should stay thin (`src/controllers/handlers/*`) and delegate to services.
- Shared request context assembly lives under `src/server/context`.
