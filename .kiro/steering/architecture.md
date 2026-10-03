# ASTIG architecture steering

## System boundaries

- **Mobile client:** session lifecycle, location, distance-based capture, lightweight quality checks, local pending-upload queue.
- **Web app:** operational map, issue filters/details, human review, work-order lifecycle.
- **API:** authorization, session and metadata operations, presigned upload URL issuance, issue/work-order reads and writes.
- **Processing worker:** S3 event intake, input validation, vision adapter, strict output validation, persistence/enrichment, retryable status transitions.
- **Postgres + PostGIS:** transactional source of truth for sessions, observations, detections, issues, score components, work orders, and resolution evidence metadata.
- **S3:** private image evidence; browser/mobile access only through appropriately scoped, short-lived URLs.
- **Quick/Quick Sight:** analytics/reporting layer, not the operational backend.

## Data and reliability rules

- Store WGS84 coordinates with explicit SRID and use PostGIS spatial indexes.
- Preserve raw observation evidence independently from clustered issues.
- Record schema/model/formula versions and processing status.
- Use stable observation IDs or idempotency keys for retry safety.
- Validate provider output against the shared contract before writing detections.
- Make retries observable; retain failed status and error context without exposing secrets.
- Keep image bytes out of database rows and normal API payloads.
- Use synthetic data for demos unless the team has approved a privacy-safe collection process.

## MVP processing path

Capture → local queue → direct S3 upload → asynchronous event/worker → schema validation → spatial enrichment and issue association → versioned score → map and review → officer-approved work order → resolution evidence/status.

## Evolution

Begin with the simplest deployable AWS path. Add a queue between S3 events and workers if retries, burst handling, or concurrency control require it. Do not create a microservice fleet for the prototype.
