# ASTIG implementation plan

Keep tasks small enough to demo incrementally. A task is done only when its acceptance check passes and interfaces remain compatible.

## P0 — Align interfaces and scaffold

- [ ] Confirm the recommended workspace/tool versions and local development commands.
- [ ] Assign four owners and name one integrator.
- [ ] Lock observation, detection, issue, risk, and work-order API/data contracts.
- [ ] Agree demo route/data source and the first end-to-end acceptance story.
- [ ] Complete the pre-build readiness gate in `docs/operations/prebuild-setup.md`.

**Done when:** each team member can work against the same contracts and the repository's setup instructions are executable.

## P0 — Establish database source of truth

- [ ] Create initial Postgres/PostGIS migration for core records and enums/check constraints.
- [ ] Add spatial indexes and UTC timestamps; keep image objects in S3.
- [ ] Add synthetic seed data and repeatable local reset/seed instructions.
- [ ] Test score limits, foreign keys, and representative spatial queries.

**Done when:** a seeded observation and issue can be queried spatially and tied to evidence without storing image bytes in the database.

## P0 — Mobile spatial capture

- [ ] Start/stop session and record device/vehicle association.
- [ ] Read GPS and capture metadata; implement distance-based sampling at the configurable prototype interval.
- [ ] Validate travelled-distance behavior on target hardware; do not claim GPS alone is VIO.
- [ ] Add basic image-quality filtering and a local pending-upload queue.
- [ ] Upload candidate images directly to S3 and safely resume after interrupted connectivity.

**Done when:** a short route yields ordered, traceable captures at the intended spatial interval and queued items upload after reconnecting.

## P0 — Backend API and upload

- [ ] Implement session start/stop and metadata validation.
- [ ] Implement scoped short-lived presigned upload URL flow.
- [ ] Implement list/detail APIs for issues and observations.
- [ ] Implement work-order creation and allowed state transitions.
- [ ] Add authentication appropriate to the demo and explicit authorization boundaries.

**Done when:** the web client can review an issue, create a work order, and update its lifecycle through the API.

## P0 — Asynchronous vision processing

- [ ] Implement S3 ingestion/worker entry point.
- [ ] Define provider adapter and validate structured output against shared schema.
- [ ] Persist processing statuses, model/schema versions, and retry-safe identifiers.
- [ ] Implement deterministic scoring with a persisted component breakdown/version.
- [ ] Cover malformed output, provider failure, duplicate delivery, and score boundary tests.

**Done when:** one uploaded demo image becomes a valid issue or an explicitly failed processing record—never a fabricated success.

## P0 — Operational web experience

- [ ] Build map view with severity/type/area filters.
- [ ] Add issue detail with latest evidence, confidence, score rationale, history, and status.
- [ ] Add create/update/resolve work-order interaction.
- [ ] Include a clear synthetic/demo-data indicator when using seeded records.

**Done when:** an officer can complete the acceptance story without direct database access.

## P0 — Analytics and demo hardening

- [ ] Provide analytics summary dataset/query.
- [ ] Demonstrate Quick/Quick Sight with issue severity, type/area, status, recurrence, and resolution/coverage metrics.
- [ ] Write demo runbook and rehearse the complete story.
- [ ] Review privacy, access, failure handling, and architecture caveats for judging.

**Done when:** the demo is repeatable without manual database intervention and limitations are stated honestly.

## P1 — Improve the pilot story after the required loop works

- [ ] Add resolution image upload and practical image redaction.
- [ ] Add weather/hazard enrichment with source and freshness metadata.
- [ ] Improve issue clustering or adaptive sampling.

## P2 — Only if the vertical slice is stable

Defer citizen app, full flood simulation, autonomous dispatch, custom CV training, and workforce routing.
