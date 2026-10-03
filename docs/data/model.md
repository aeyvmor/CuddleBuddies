# Data model and spatial conventions

## Core entities

| Entity | Purpose | Key relationships |
| --- | --- | --- |
| Device | App/device identity and status | Belongs to/observes a vehicle |
| Vehicle | Inspection platform | Has devices and sessions |
| InspectionSession | Bounded route/inspection attempt | Has observations |
| Observation | Immutable capture metadata and image reference | Belongs to session; has detection; may be linked to issue |
| Detection | Validated model evidence | Belongs to observation |
| Issue | Canonical operational problem grouping | Has observations, risk assessments, work orders |
| RiskAssessment | Score and explainable components at a point in time | Belongs to issue |
| WorkOrder | Human-approved action and lifecycle | Belongs to issue |
| ResolutionEvidence | Evidence attached to work-order completion | Belongs to work order |

## Conventions

- Store times as UTC instants; convert for display at the client.
- Store latitude/longitude as numeric input with range checks and a PostGIS `POINT` using SRID 4326.
- Preserve original capture point and available accuracy; snapping to roads must not overwrite source coordinates.
- Add GiST spatial indexes to frequently queried geometry columns; use relational indexes for status/time/foreign-key access patterns.
- Keep image bytes in private S3. Persist object key, content metadata, and access policy references only.
- Retain every observation as evidence even when issue clustering merges it into an existing issue.
- Store model, output schema, and scoring formula versions so historical results are explainable.
- Use constrained status values and enforce legal transitions in application/domain logic (and database constraints where practical).
- Use migrations as the only authoritative schema changes; do not rely on manual production-console edits.

## Score factors

Persist normalized/raw component values and weighted component values separately if useful. The total must remain in `[0,100]`, each weighted component must not exceed its configured cap, and all caps together must not exceed 100. Distinguish missing data from zero risk.

## Clustering caution

Spatial proximity alone can merge adjacent drains or unrelated issues. Prototype clustering should at minimum consider issue type and configurable distance, preserve linked observations, and allow human correction. Use temporal or visual similarity only if implemented and testable.

## Migration acceptance

A fresh database can apply all ordered migrations, enable PostGIS, seed synthetic records, run representative point/radius/nearest-road queries, and enforce foreign keys and status/score constraints.
