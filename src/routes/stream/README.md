# Stream Routes Layer

Purpose:
- Register HTTP route paths and connect them to controller handlers.

Rules:
- Keep this layer thin; do not place business logic here.
- Prefer imports from `src/controllers/stream/*`.
- Avoid direct imports from `src/services/*` or `src/integrations/*`.
