# Stream Services Layer

Purpose:
- Host stream use-cases and orchestration logic.

Rules:
- May depend on domain and integration modules.
- Keep transport concerns out (no direct `req`/`res` handling).
- Keep functions composable and dependency-injected at boundaries.
