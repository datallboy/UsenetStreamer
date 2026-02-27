# V2 Explicit Out-of-Scope List (V2-018)

## Purpose
Protect delivery of the V2 modular refactor by explicitly deferring work that can cause high risk or timeline drift.

## Out of Scope for V2

1. Full framework rewrite to NestJS.
Reason: too much migration risk for a single-maintainer, production-used codebase.

2. Big-bang rewrite of the entire app.
Reason: behavior parity cannot be safely guaranteed without stronger full-system coverage.

3. Admin UI redesign/rebrand.
Reason: V2 priority is backend modularity and runtime behavior safety, not visual overhaul.

4. Replacing vendor internals (`parse-torrent-title` internals, third-party protocol libraries).
Reason: treat these as integration boundaries first; internals can be changed later with dedicated compatibility testing.

5. Database introduction or persistence model rewrite.
Reason: current app is runtime/env driven; introducing DB concerns now increases scope and rollback complexity.

6. Breaking API contract changes for addon endpoints (`manifest`, `catalog`, `meta`, `stream`, `nzb/stream`, `easynews/nzb`).
Reason: V2 objective is maintainability with behavior equivalence for existing users.

7. Performance tuning not tied to correctness regressions.
Reason: baseline capture is in scope; large performance optimization projects are deferred until after modular extraction stabilizes.

8. Multi-node/distributed runtime architecture.
Reason: no immediate requirement and high operational complexity for current team size.

## Change Control Rule
If any out-of-scope item becomes required, it must be added as a new milestone task with:

- explicit risk classification,
- rollback criteria,
- and acceptance checks.

Do not execute out-of-scope work inside unrelated refactor PRs.
