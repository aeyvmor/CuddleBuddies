# Hackathon execution plan

## North-star deliverable

Ship one believable, repeatable vertical slice—not a partially built version of every roadmap feature:

> A captured (or visibly synthetic) geolocated image becomes a schema-validated infrastructure observation, appears on the map with an explainable score, is reviewed by a human, becomes a work order, reaches resolved status, and appears in analytics.

If phone capture or live AI threatens this path, use clearly labeled synthetic data or a truthful prerecorded model result as a fallback. Do not present seeded output as live inference.

## Four-person split

| Person | Primary ownership | Concrete deliverables | Pair/support points |
| --- | --- | --- | --- |
| You — backend/database + AWS learner/operator | Postgres/PostGIS, migrations, TypeScript API/data contracts, AWS account/deployment path with guided checks, scoring persistence, upload/processing interfaces | Core schema and seed data; issue/work-order API; score factors/version; local DB instructions; staged AWS setup with verified identity/budget; failure/idempotency behavior | Define contracts with the client owner first; ask a teammate/account owner to review AWS changes before deployment |
| Teammate 2 — client owner | Android React Native capture **and** React + Vite web dashboard | Session/capture/location/upload; map, issue detail, filters, score display, work-order UI | Pair with you on the shared contract early; split client sub-tasks internally only if bandwidth allows |
| Teammate 3 — hackathon requirements and QA support | Translate event requirements into a checklist; validate product/story, collect approved demo materials, test acceptance paths, maintain issues/demo script | Requirement traceability; test cases; UX/content feedback; demo rehearsal and fallback checklist | Support both client and backend owners; do not create a second competing spec or change API fields without agreement |
| Teammate 4 — integration and remaining requirements support | Cross-cutting integration, analytics/Quick feasibility, pitch/demo support, and unblock the busiest owner | End-to-end smoke tests; integration checklist; analytics demo path; judging narrative and operational caveats | Coordinate shared checkpoints; can pick up discrete AI/worker/infrastructure tasks after agreement, but you remain AWS deploy owner |

Swap or combine roles if that better fits actual teammate skills, but explicitly name one integrator/demo owner. Avoid parallel implementation against unreviewed endpoint or schema assumptions.

## Build order

### 1. Kickoff and contract lock

- Read `.kiro/specs/astig/requirements.md` and `docs/architecture/system-overview.md`.
- Confirm the recommended monorepo, local PostGIS, map provider, auth/demo mode, IaC approach, and inference provider.
- Assign owners and identify the integrator; client owner covers both mobile and web.
- Agree one observation JSON, one detection output, one issue detail shape, one score breakdown, and allowed work-order states.
- Choose whether the main demo uses a real capture, synthetic seed, or both.

**Exit check:** all four owners can name the same acceptance story and API/data contract.

### 2. Get the workflow visible early

- Backend/database: create a small PostGIS schema and deterministic seed dataset.
- Client owner: render seeded issues on the map while proving a minimal Android capture path.
- You: create the schema/API/score and expose a stable seeded issue response early.
- Support owners: validate the acceptance checklist and surface blockers immediately.

**Exit check:** a judge can already see an issue and understand why it is prioritized, even before live capture or AI is connected.

### 3. Connect real processing

- Mobile client obtains upload authorization and uploads image evidence directly to S3.
- Worker validates metadata and AI output, writes explicit processing status, and associates the observation to an issue.
- Database/API remain the authoritative source for score and work-order state.
- Make retries safe and show failure states.

**Exit check:** one capture or controlled sample becomes visible without manual database edits.

### 4. Close the human action loop

- Officer reviews image, confidence, and score rationale.
- Officer creates a work order and moves it through `OPEN → IN_PROGRESS → RESOLVED`.
- Analytics reflect the lifecycle change.

**Exit check:** complete the story from observation to resolution in one rehearsal.

### 5. Stabilize and pitch

- Rehearse with live dependencies and with the fallback path.
- Label synthetic, estimated, or missing data.
- Explain sampling, spatial uncertainty, privacy, and what the risk score does/does not mean.
- Defer stretch items if they threaten the end-to-end demo.

## Deliverable priority

### P0 — Required for a convincing demo

1. Agreed shared data/API contract and stable local development path.
2. Postgres/PostGIS schema, migration, and small synthetic dataset.
3. Smartphone session and distance-based capture, with direct S3 upload and a viable offline queue.
4. Async vision processing with strict structured-output validation and explicit failure states.
5. Issue map and detail with image evidence, confidence, and score breakdown.
6. Deterministic capped score with persisted factors/formula version.
7. Work-order create and lifecycle updates.
8. Quick/Quick Sight analytics and a repeatable end-to-end demo runbook.

### P1 — Add once P0 is stable

- Resolution image, basic redaction, optional weather/hazard enrichment.

### P2 — Do not let these block the demo

- Full flood model, autonomous dispatch, citizen app, custom model training, nationwide tenancy, advanced workforce routing, production-scale map matching.

## Integration checkpoints

- **Checkpoint A — contracts:** mobile, web, API, worker agree on field names, IDs, statuses, and errors.
- **Checkpoint B — local vertical slice:** seeded issue renders from API/database; work order persists.
- **Checkpoint C — evidence path:** uploaded object and metadata are visible with correct access controls.
- **Checkpoint D — full rehearsal:** complete happy path plus provider/network failure fallback.

At every checkpoint, surface blocked dependencies quickly rather than waiting until feature completion.

The seed/prerecorded path is a contingency for provider, device, or network failure, not the target definition of done. Clearly disclose it if used.
