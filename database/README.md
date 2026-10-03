# Database

Postgres + PostGIS is the spatial source of truth. Add ordered migrations under `migrations/`, deterministic synthetic demo data under `seeds/`, and local database configuration under `local/` after the team selects its runtime/tooling.

Never use manual schema edits as the only record of a change. Verify migrations against a fresh database and keep evidence images in S3, not in database blobs.
