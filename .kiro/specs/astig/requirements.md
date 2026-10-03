# ASTIG hackathon MVP requirements

## Product outcome

Convert routine road travel into useful infrastructure observations and an auditable human-operated response loop.

## Must demonstrate

1. **Inspection session:** an authorized operator starts/stops a session associated with a device, vehicle, time, and location.
2. **Spatial capture:** candidate images are sampled by travelled distance (prototype target about 7 m, configurable), not by a fixed timer; capture metadata includes UTC time and coordinates.
3. **Candidate quality:** low-quality/duplicate frames can be marked or filtered before costly inference.
4. **Reliable ingestion:** images upload to private S3 using a batch/offline-capable path and traceable metadata; retries do not create duplicate observations.
5. **Structured AI evidence:** inference returns schema-validated JSON for infrastructure visibility, issue/obstruction type, applicable blockage estimate, severity, confidence, evidence description, and human-review flag.
6. **Spatial data:** observations are stored with PostGIS geometry, associated with a road/administrative area when data permits, and raw GPS uncertainty is not misrepresented as exact asset location.
7. **Issue history:** nearby repeat observations can be associated with one issue while each observation remains independently available as evidence.
8. **Explainable priority:** a versioned 0–100 score combines configurable factors. Prototype weights: severity 35%, weather 25%, recurrence 20%, hazard 10%, population/road exposure 10%. Component caps must sum to no more than 100.
9. **Human approval:** AI output and scores are advisory. An authorized officer reviews an issue before creating operational work.
10. **Map and detail:** users can locate/filter issues and inspect evidence, confidence, location, score breakdown, history, status, recommendation, and work-order state.
11. **Work orders:** officers create and assign a work order and move it through `OPEN → IN_PROGRESS → RESOLVED`; rejected/needs-review can remain optional.
12. **Resolution evidence:** support attaching an image reference to a resolved work order; automated before/after analysis is not required.
13. **Analytics:** expose summary metrics for issue count/type/severity/area, open versus resolved, resolution time, recurrence, and route coverage. Quick/Quick Sight is analytics, not the transaction system.

## Explicit non-goals

- Deterministic flood prediction or full hydrological simulation.
- Autonomous dispatch or AI-authorized government decisions.
- Continuous video streaming or cloud inference on every camera frame.
- Custom model training, nationwide production rollout, full citizen app, advanced crew routing.
- Scientifically validated risk coefficients; prototype weights are configurable demonstration assumptions.

## Acceptance story

Using either a captured route or clearly labeled synthetic seed data, demonstrate an image-backed geolocated issue, validated detection, explainable score, human review, creation of a work order, status transitions to resolved, and a corresponding analytics summary—with no manual database edits during the demo.

## Risks and caveats

- The ~7 m target requires device/camera testing; the source architecture calls for VIO-based distance, while GPS alone is noisy and must not be treated as precise movement.
- Road/area matching and issue clustering depend on available local geodata and need uncertainty-aware fallback behavior.
- Weather/hazard/exposure inputs may be unavailable during a one-day build; make absent inputs explicit and do not silently imply measured risk.
- Public-road imagery may contain personal information. Minimize, restrict, redact where practical, and define retention before real collection.
