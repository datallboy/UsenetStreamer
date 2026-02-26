# Stream Integrations Layer

Purpose:
- Wrap external providers and client-specific protocols for stream features.

Rules:
- Keep I/O and provider mapping isolated here.
- Return normalized data contracts for service consumption.
- Do not import controllers or routes.
