# Database

Postgres + PostGIS is the spatial source of truth. Ordered SQL migrations live in `migrations/`, the deterministic synthetic demo dataset in `seeds/`, and local Docker configuration in `local/`. Schema changes go through migrations only, never through manual console edits. Evidence images stay in S3; the database stores only server-derived object keys (no `bytea` columns).

## Local setup (from the repository root)

Prerequisites: Node 24 LTS (`.nvmrc`), Docker Desktop running.

```text
copy .env.example .env      # PowerShell/cmd; use `cp` on macOS/Linux. Local-only values.
npm install
npm run db:up               # PostGIS 17/3.5 on 127.0.0.1:5433 (avoids a host Postgres on 5432)
npm run db:migrate          # applies pending migrations; safe to re-run
npm run db:seed             # inserts the SYNTHETIC demo dataset once
npm run db:reset            # LOCAL ONLY: drop schema, migrate, seed (pristine demo state)
npm run test:db             # recreates astig_test from migrations and runs DB integration tests
npm run db:down             # stop the container (data volume is kept)
```

`db:reset` and the test setup refuse to run against a non-loopback host. The test database name must end in `_test` because it is dropped on every run.

## Migrations

- File name: `NNNN_description.sql`, applied in order, each in its own transaction, recorded in `schema_migrations` with a checksum.
- Editing an applied migration is refused; add a new numbered migration instead.
- A concurrent `migrate` run waits on an advisory lock instead of racing.

## Schema highlights (`0001_initial_schema.sql`)

| Rule | Enforcement |
| --- | --- |
| WGS84 coordinates | `latitude BETWEEN -90 AND 90`, `longitude BETWEEN -180 AND 180` (also rejects NaN/Infinity); generated `geometry(Point,4326)` with GiST indexes |
| Idempotent capture | `UNIQUE (session_id, client_observation_id)` plus a metadata fingerprint to detect key reuse |
| Processing state | `PENDING/PROCESSING/COMPLETED/FAILED`; `FAILED` requires an error; `COMPLETED` requires a detection (deferred trigger) |
| One detection per observation | `UNIQUE (observation_id)`; confidence `[0,1]`, blockage `[0,100]`, enums constrained |
| Score bounds | Total and caps `[0,100]`; `weighted_points <= cap`; `UNKNOWN` inputs carry no value; caps sum ≤ 100 and totals match components (deferred trigger) |
| Work orders | Assessment must belong to the same issue (composite FK); one active order per issue; `OPEN → IN_PROGRESS → RESOLVED` and immutable `RESOLVED` (trigger); lifecycle timestamps consistent; audit rows in `work_order_events` |

## Synthetic seed

`seeds/synthetic-demo.ts` holds fixed UUIDs and UTC timestamps: 3 issues, 7 observations (including one explicit `FAILED` and one `PENDING`), 3 risk assessments, and 2 work orders. Every row has `is_synthetic = true`, and the seed's free-text values start with `SYNTHETIC`. Coordinates sit on public roads around a public park in Quezon City as a pilot-area placeholder. Scores are computed by `@astig/domain`; weather and hazard inputs are `UNKNOWN`, and the one exposure value is labeled a synthetic assumption. No images are committed. On the deployed stack, the 5 issue-linked seed observations have **labelled placeholder images** ("SYNTHETIC DEMO IMAGE … Seed record - not a real capture", generated with ffmpeg) uploaded to their server-derived keys. Without them the API returns valid signed URLs to missing objects and the UI shows broken images. They survive `reset-demo` (same deterministic keys) and expire with the bucket's 30-day lifecycle; re-upload them if a deployment is older than that. The worker skips them as `ALREADY_COMPLETED`.

## Shared data functions (`src/`)

`registerObservation` (idempotent capture registration, operator-scoped, server-derived S3 key) and `insertRiskAssessment` are shared with the API and the future worker so idempotency rules exist in one place.
