# ASTIG hackathon design

## Context

The system makes ordinary vehicle trips a source of geolocated infrastructure evidence and turns validated observations into human-reviewed work. The operational value is the loop, not an AI-only detection demo.

## Component layout

```text
apps/mobile ── presigned S3 upload ──> private evidence bucket
     │                                      │ event
     └── API: sessions/metadata             ▼
                                      services/worker
                                             │
apps/web ── API Gateway/Lambda API ──> Postgres + PostGIS
     │                                      │
     └── map/review/work orders             └── analytics dataset → Quick/Quick Sight
```

Keep a shared, provider-neutral contract for observation metadata and AI output. The Gemini adapter is a hackathon implementation choice, not a domain dependency.

## Processing

1. Start an inspection session and record device/vehicle association.
2. Sample by travelled distance; locally filter unsuitable/duplicate candidates where feasible.
3. Queue pending images locally when offline. Request short-lived upload authorization and upload bytes directly to private S3.
4. Process asynchronously. Validate metadata, call the selected vision provider, parse/validate its response, and persist an observation plus detection only when valid.
5. Mark failures explicitly and permit retry; make each upload/processing operation idempotent.
6. Enrich with road/area data when available; retain original coordinates and uncertainty.
7. Associate repeat observations with an issue without deleting the evidence history.
8. Calculate and persist score components, total, and formula version.
9. Present evidence and rationale; require officer action to create a work order.
10. Track work-order state and resolution evidence, then expose aggregates for analytics.

## Domain records

Device, Vehicle, InspectionSession, Observation, Detection, Issue, RiskAssessment, WorkOrder, ResolutionEvidence. Use relational migrations, foreign keys, constraints, timestamps in UTC, explicit status values, and PostGIS geometry/SRID plus spatial indexes.

## API surface to contract

`POST /sessions`; `POST /sessions/{id}/observations`; `POST /upload-url`; `GET /observations`; `GET /issues`; `GET /issues/{id}`; `POST /issues/{id}/work-orders`; `GET /work-orders`; `PATCH /work-orders/{id}`; `POST /work-orders/{id}/resolution-evidence`; `GET /analytics/summary`.

The exact request/response types, auth model, and endpoint versioning must be agreed before clients are implemented. Do not send image bytes through the application API.

## Scoring

Normalize each input to 0–100, multiply by the configurable prototype weight, cap each weighted component at its allocated maximum, and sum to 0–100. Persist each component and a `formula_version`. Clearly distinguish unavailable context inputs from measured zero-risk values.

## Decisions not yet made

See `docs/architecture/decisions.md` for language/framework, IaC, map provider, auth, upload trigger/queue, inference provider configuration, and team ownership.

## Production evolution

Add queue-backed worker concurrency controls, managed identity, image redaction/retention controls, privacy/access audit, calibrated locally evaluated models, robust map matching, and explicit LGU tenancy only when the pilot requires them.
