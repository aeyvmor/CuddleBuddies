# ASTIG system overview

## What we are building

ASTIG (Automated Street & Infrastructure Geospatial Intelligence) uses vehicles already traveling public roads as mobile observation platforms. A mounted phone samples road imagery by distance, associates each capture with GPS and time, and uploads candidate images for structured vision analysis. The platform spatially organizes the evidence, explains which issues merit attention, and gives local-government personnel a way to review and turn an issue into a work order.

**Value proposition:** every routine road trip can contribute current street-level infrastructure evidence without requiring a dedicated inspection trip.

## Problem and target users

Inspections are periodic, manual, and difficult to scale. Environment/sanitation, engineering, DRRM, and operations personnel need current, geographically useful evidence to decide what to inspect and act on first. The operations officer is the primary MVP user; the product supports, rather than replaces, expert judgment.

## Product loop

```text
OBSERVE → UNDERSTAND → LOCATE → PRIORITIZE → HUMAN REVIEW → ACT → VERIFY
```

1. A vehicle operator starts an inspection session.
2. A mobile client captures candidate still images at a configurable travelled-distance interval (prototype target about 7 m), with coordinates/time/session/device/vehicle metadata.
3. Quality filtering and an offline queue reduce waste and tolerate intermittent connectivity.
4. The client uploads images directly to private S3 using short-lived presigned URLs.
5. An asynchronous worker calls the selected vision provider (Gemini is the proposed hackathon choice), validates the strict output contract, and records an observation/detection or explicit failure.
6. Postgres/PostGIS stores history and supports road/area matching and issue clustering. Raw GPS is uncertain; do not imply exact asset location.
7. A deterministic 0–100 risk/priority calculation stores its factors and formula version. It is an explainable prioritization aid, not flood probability.
8. An authorized officer reviews evidence and creates a generic work order, then tracks `OPEN → IN_PROGRESS → RESOLVED`; resolution evidence is optional.
9. React provides the operational map and workflow. Amazon Quick/Quick Sight provides executive analytics, not transactional operations.

## MVP scope

### Must prove

- Session and geolocated image metadata.
- Distance-based sampling (not a timer-only approximation), with offline capability where feasible.
- Private S3 evidence upload and async inference.
- Schema-valid structured detection with confidence and human-review signal.
- PostGIS observation storage, issue history, explainable score, and map/detail UI.
- Human-approved work-order lifecycle.
- Quick/Quick Sight or an agreed demonstrable analytics path.
- A rehearsed demo that needs no manual database edits.

### Deliberately not building today

Full flood/hydrological simulation, autonomous dispatch, continuous video upload, nationwide service, citizen reporting app, custom model training, advanced crew routing, and production-grade multi-LGU tenancy.

## Architecture boundaries

| Component | Owns | Avoids |
| --- | --- | --- |
| Mobile | Capture, session state, location, local quality, offline queue | AI-driven priority or storing credentials in app |
| API | Auth, metadata validation, presigned URL issuance, query/work-order operations | Proxying large image bodies |
| Worker | Async processing, provider adaptation, schema validation, retry/status | Hiding inference errors or inventing valid detections |
| Database | Relational/spatial source of truth and history | Image binary storage or unversioned derived scores |
| S3 | Private original/derived evidence objects | Publicly readable raw imagery |
| Web | Operations map, review, work-order actions | Replacing government decisions with AI |
| Quick/Quick Sight | Aggregated and executive analytics | Becoming the operational system of record |

## Risk score

Prototype weight distribution:

| Factor | Weight |
| --- | ---: |
| Infrastructure severity | 35% |
| Weather risk | 25% |
| Recurrence/history | 20% |
| Hazard exposure | 10% |
| Population/road exposure | 10% |

Normalize inputs to 0–100, cap each weighted component at its allocated maximum, and persist component values, total, and formula version. A missing weather/hazard feed is **unknown**, not a measured score of zero. State that the weights are demonstrative and unvalidated.

## Important engineering caveats

- **7 m sampling:** validate device/camera hardware and VIO feasibility. GPS drift is not a substitute for reliable travelled-distance estimation.
- **Spatial uncertainty:** preserve capture point and consider accuracy metadata; road snapping and issue clustering should be conservative.
- **Async reliability:** S3 events can be retried/duplicated. Use idempotent processing and explicit failure states. Add SQS when useful for retry/concurrency control, not as architecture decoration.
- **AI trust:** constrain output schema, version prompts/models, and preserve evidence. AI output is not a work order.
- **Privacy:** public-road imagery can identify people/plates. Minimize collection, restrict access, plan redaction and retention; use synthetic data for the demo unless collection is approved.
- **Scope:** weather, hazard, data quality, and Quick integration depend on accounts/data access. Don't let these block the core acceptance story.

## End-of-day deliverable

One convincing, repeatable story: show a sample capture/seeded observation on the map, inspect the image and confidence, explain its score, create a work order, progress it to resolved, and show an analytics summary. Report limitations honestly.
