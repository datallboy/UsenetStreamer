# Stream Controllers Layer

Purpose:
- Handle request/response interaction and input normalization.

Rules:
- Delegate application logic to `src/services/stream/*`.
- Avoid client/network logic in controllers.
- Keep response shaping explicit and easy to test.
