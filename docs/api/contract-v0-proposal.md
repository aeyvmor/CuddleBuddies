# Contract v0 proposal (backend) — PENDING TEAM CONFIRMATION

Status: **draft for kickoff review**, not frozen. Proposed by the backend owner on 2026-10-03.
The machine-readable source is `packages/contracts/src/` (Zod). The backend slice is implemented
against this draft so the team can review working code; any field rename will be cheap until clients
start consuming it. Items marked **[gap]** extend `docs/api/contract.md` and need explicit approval.

## Conventions

| Topic | Proposal |
| --- | --- |
| JSON casing | `camelCase` in API JSON; `snake_case` in SQL. |
| IDs | Server-generated UUIDs. Client-generated UUID only for `clientObservationId` and work-order `idempotencyKey`. |
| Time | ISO 8601 UTC with `Z` (e.g. `2026-10-03T01:02:03.000Z`). Offsets are rejected. |
| Coordinates | `{ "latitude": number, "longitude": number }`, WGS84 decimal degrees; latitude `[-90,90]`, longitude `[-180,180]`. Stored as numeric columns plus a generated PostGIS `geometry(Point,4326)` (`ST_MakePoint(longitude, latitude)`). |
| Units | Suffix in name: `horizontalAccuracyM`, `distanceFromPreviousM`, `blockagePercent`. |
| Versions | Each payload carries `schemaVersion` (`observation-capture.v0`, `detection.v0`, `issue-detail.v0`); scores carry `formulaVersion` (`risk.v0`). |
| Errors | `{ "error": { "code": "STABLE_CODE", "message": "safe text", "requestId": "...", "details"?: [...] } }`. |
| Demo labeling | Every device/vehicle/session/observation/issue row has `isSynthetic`. Seeded rows are `true`. |
| Auth | Bearer identity resolved to `{ subject, roles }`. Roles: `OPERATOR` (capture), `OFFICER` (review/work orders). Implementation (Cognito vs. demo) still open — see decisions. |
| API versioning | **[decision needed]** Routes are unprefixed in this draft; propose a `/v0` base path once the gateway exists. |

## Inspection session

`id`, `deviceId`, `vehicleId`, `operatorSubject` (from auth, never from body), `status: ACTIVE | ENDED`,
`startedAt`, `endedAt | null`, `startLocation`, `isSynthetic`. Observations are accepted while `ACTIVE`, and after
`ENDED` only if `capturedAt <= endedAt` (so the offline queue can drain after the operator stops the session).
Only the session's operator may register observations.

## Observation (capture metadata) and idempotency

Request (`POST /sessions/{id}/observations`, contract only in this slice):

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `"observation-capture.v0"` | |
| `clientObservationId` | UUID | **Idempotency key**, unique per session. |
| `sequenceNumber` | int ≥ 0 | Client ordering within session. |
| `capturedAt` | UTC instant | |
| `location` | coordinates | Raw device fix; never overwritten by snapping. |
| `horizontalAccuracyM` | number ≥ 0 \| null | `null` = unknown, not exact. |
| `samplingMethod` **[gap]** | `VIO_DISTANCE \| GPS_DISTANCE \| MANUAL` | Mobile prompt requires surfacing sampling method; GPS distance must not be presented as VIO. |
| `distanceFromPreviousM` **[gap]** | number ≥ 0 \| null | Distance estimate that triggered capture. |

The client **does not send an S3 key**. The server derives
`sessions/{sessionId}/observations/{clientObservationId}.jpg`, so object keys are always scoped to an
authorized session. The upload-URL endpoint (integration owner) should presign exactly that key.

Duplicate semantics: same `(sessionId, clientObservationId)` with identical metadata → return the existing
observation (`200`, `created: false`). Same key with different metadata → `409 IDEMPOTENCY_CONFLICT`.

## Processing status

`PENDING` (registered, awaiting upload/processing) → `PROCESSING` → `COMPLETED | FAILED`; `FAILED → PROCESSING`
for retry. `FAILED` requires `processingError.code`. `COMPLETED` is only set together with a validated detection.
Observation response exposes `processingStatus`, `processingAttempts`, `processingError: { code, message } | null`.

## Detection (validated model output)

Strict object (unknown properties rejected):
`schemaVersion: "detection.v0"`, `infrastructureVisible: boolean`,
`issueType: BLOCKED_DRAIN | DAMAGED_DRAIN | STANDING_WATER | ROAD_DAMAGE | OTHER | NONE` **[enum values proposed]**,
`obstructionType: GARBAGE | SEDIMENT | VEGETATION | DEBRIS | OTHER | NONE` **[proposed]**,
`blockagePercent: 0–100 | null`, `severityEstimate: NONE | LOW | MODERATE | HIGH | CRITICAL` **[proposed]**,
`confidence: 0–1`, `evidenceDescription: 1–500 chars`, `requiresHumanReview: boolean`, `modelVersion: 1–100 chars`.
Rule: if `infrastructureVisible` is `false`, `issueType` must be `NONE` and `blockagePercent` `null`.
One detection per observation (DB unique), so duplicate worker delivery cannot create two.

## Issue and issue detail (`GET /issues/{id}`, role `OFFICER`)

```text
{ schemaVersion: "issue-detail.v0",
  issue: { id, issueType, status: OPEN | RESOLVED, location, locationUncertaintyM | null,
           areaName | null, roadName | null, firstObservedAt, lastObservedAt, observationCount, isSynthetic },
  riskAssessment: ScoreBreakdown | null,
  observations: [ { id, sessionId, capturedAt, location, horizontalAccuracyM, samplingMethod,
                    processingStatus, processingError, isSynthetic, detection | null, evidence } ],  // newest 50
  observationsTruncated: boolean,
  workOrders: [ WorkOrder ] }   // newest first
```

`evidence` is `{ status: "AVAILABLE", url, expiresAt }` (short-lived presigned GET) or
`{ status: "UNAVAILABLE", reason: "SIGNER_NOT_CONFIGURED" | "NOT_UPLOADED" }`. Object keys and bucket names are never returned.

**[gap]** Requirement 10 lists a "recommendation". Proposal: a deterministic priority band from the score
(e.g. `LOW/MEDIUM/HIGH`), added only after the team agrees thresholds. Not implemented.

## Score breakdown (`formulaVersion: "risk.v0"`)

```text
{ id, issueId, formulaVersion, totalScore (0–100), knownCapTotal (max points achievable from known inputs),
  computedAt,
  components: [ { factor: SEVERITY | WEATHER | RECURRENCE | HAZARD | EXPOSURE,
                  weight, cap, inputStatus: KNOWN | UNKNOWN,
                  normalizedValue: 0–100 | null, weightedPoints: 0–cap | null,
                  source | null, rationale } ] }
```

Prototype weights/caps: severity 0.35/35, weather 0.25/25, recurrence 0.20/20, hazard 0.10/10, exposure 0.10/10
(caps sum to 100; config with caps > 100 is rejected). `weightedPoints = min(normalizedValue × weight, cap)`.
`UNKNOWN` inputs contribute no points and are **not** zero risk; `knownCapTotal` lets the UI say
"37 of 75 measurable points". Out-of-range or non-finite inputs are errors, not clamped.
Severity normalization: `NONE 0, LOW 25, MODERATE 50, HIGH 75, CRITICAL 100`. Recurrence: `min(100, (observationCount − 1) × 25)`.
Confidence is displayed but not multiplied into the score (keeps the formula explainable; revisit with the team).

## Work order lifecycle

`WorkOrder`: `id`, `issueId`, `riskAssessmentId` (score the officer reviewed), `status: OPEN | IN_PROGRESS | RESOLVED`,
`assignedTeam | null` (team/department, not a person's name), `notes | null`, `createdBySubject`,
`createdAt`, `updatedAt`, `startedAt | null`, `resolvedAt | null`, `version`.

- `POST /issues/{id}/work-orders` (role `OFFICER`): body `{ idempotencyKey, riskAssessmentId, assignedTeam?, notes? }`.
  `201` on create; `200` replay for same `(issueId, idempotencyKey)` and identical body (different body →
  `409 IDEMPOTENCY_CONFLICT`). Issue must be `OPEN` (`409 ISSUE_NOT_OPEN`). Only one non-resolved work order per issue
  (`409 ACTIVE_WORK_ORDER_EXISTS`). `riskAssessmentId` must belong to the issue (`409 RISK_ASSESSMENT_MISMATCH`).
  Creating a work order **is** the human approval step; AI output never creates one.
- `PATCH /work-orders/{id}` (role `OFFICER`): body with at least one of `{ status?, assignedTeam?, notes? }`.
  Allowed transitions: `OPEN → IN_PROGRESS → RESOLVED`. Same-status is an idempotent no-op. Anything else →
  `409 INVALID_TRANSITION`. `RESOLVED` is terminal; further edits → `409 WORK_ORDER_CLOSED`.
  Resolving the active work order sets the issue to `RESOLVED`. Every change appends a `work_order_events` audit row.
- Optional `REJECTED / NEEDS_REVIEW` states are not included in v0.

## Error codes

`VALIDATION_FAILED 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `INVALID_TRANSITION 409`,
`WORK_ORDER_CLOSED 409`, `ISSUE_NOT_OPEN 409`, `ACTIVE_WORK_ORDER_EXISTS 409`, `RISK_ASSESSMENT_MISMATCH 409`,
`IDEMPOTENCY_CONFLICT 409`, `INTERNAL_ERROR 500`.

## Questions for the team

1. Approve the **[gap]** fields (`samplingMethod`, `distanceFromPreviousM`) and the proposed enums.
2. Approve server-derived object keys; integration owner confirms the upload-URL endpoint presigns that key.
3. Confirm the recommendation/priority-band approach and thresholds.
4. Confirm `/v0` base path and auth provider (Cognito vs. demo-only).
5. Should creating a work order require the *latest* risk assessment (reject stale reviews)?
6. Integration owner: the worker should reuse `@astig/database` (`registerObservation`, `insertRiskAssessment`)
   and set `COMPLETED` only in the same transaction that inserts the validated detection (enforced by the DB).

## Implemented in the first backend slice

Deployed to AWS behind Cognito JWT (see `infra/aws/README.md`):

- `OFFICER`: `GET /issues/{id}`, `POST /issues/{id}/work-orders`, `PATCH /work-orders/{id}`.
- `OPERATOR`: `POST /sessions`, `PATCH /sessions/{id}`, `POST /sessions/{id}/observations`, `POST /upload-url`.

Additions since the first draft:

- **Sessions:** `POST /sessions` takes a client-generated `clientSessionId` (UUID) that becomes the session id. This lets the mobile app start sessions offline and retry safely. `PATCH /sessions/{id}` with `{ status: "ENDED", endedAt }`.
- **Observation registration:** returns `{ created, observation: { id, sessionId, clientObservationId, processingStatus, isSynthetic, createdAt } }`.
- **Upload URL:** `POST /upload-url` with `{ observationId, contentType: "image/jpeg", contentLengthBytes ≤ 10 MiB }` returns `{ method: "PUT", url, headers, expiresAt }`. The URL lasts 5 minutes, and both content-type and exact length are signed. The client must PUT with exactly those headers. `409 ALREADY_UPLOADED` means the upload is already done; treat it as success.
- **New error codes:** `ALREADY_UPLOADED 409`, `SERVICE_UNAVAILABLE 503`.
- **Resolution evidence (2026-10-04):** `POST /work-orders/{id}/resolution-evidence` (`OFFICER`) with `{ clientEvidenceId, contentType: "image/jpeg", contentLengthBytes, note? }`. Allowed only once the work order is `IN_PROGRESS` or `RESOLVED`, at most 5 per work order. Returns `{ created, evidence: { id, workOrderId, status: PENDING_UPLOAD|UPLOADED, note, createdBySubject, createdAt, uploadedAt }, upload: presigned PUT | null }`, and is idempotent per `clientEvidenceId`. `GET /issues/{id}` adds an optional `resolutionEvidence: [{ id, workOrderId, note, createdAt, evidence }]`. No automated before/after analysis.
- **Processing failure codes:** `PROVIDER_NOT_CONFIGURED`, `PROVIDER_ERROR`, `PROVIDER_TIMEOUT`, `INVALID_MODEL_OUTPUT`, `IMAGE_TOO_LARGE`, `IMAGE_UNREADABLE`. This answers web gap G7.
- **`samplingMethod` gains `DASHCAM_REPLAY` (approved 2026-10-04)** for frames replayed from recorded footage; the web label reads "Dashcam replay (recorded footage)".
- **`Detection.regions` (optional, 2026-10-04):** up to 5 `{ label: issue type, box: [ymin, xmin, ymax, xmax] }`, integers 0-1000 relative to image height and width. Empty or absent means no box. It is rejected on `NONE` / not-visible results, and stored in `detections.regions` (migration `0005`). These are AI-estimated and approximate.
- **`areaName`** on new issues is set from loaded administrative boundaries (NCR cities from OpenStreetMap, ODbL). It's `null` when no boundary contains the point.

Not yet implemented: `GET /observations`, resolution evidence, device/vehicle registration API (the admin Lambda can register them), a real vision provider.

### Issue list and analytics (answers web gaps G1–G5)

- **`GET /issues` (role `OFFICER`).**
  - **Query parameters (all optional):** `issueType`, `severity`, `areaName`, `status` (`OPEN|RESOLVED`), `workOrderStatus` (`OPEN|IN_PROGRESS|RESOLVED|NONE`), `bbox=minLon,minLat,maxLon,maxLat`, `limit` (default 50, max 200), `cursor`.
  - **Response:** `{ items: IssueListItem[], nextCursor, areaNames }`. Each item is `{ issue, severity, totalScore, workOrderStatus }`.
  - **Field meanings:** `severity` is the highest `severityEstimate` across completed detections (G2, server-side). `workOrderStatus` comes from the newest work order. `areaNames` lists the distinct known areas (G5).
  - **Sort order:** score descending (unscored last), then `lastObservedAt` descending, then id.
  - **Errors:** unknown query parameters return `400`.
- **`GET /analytics/summary` (role `OFFICER`)** returns:
  - issue totals: open/resolved, by type, by severity, by area;
  - work orders: open, in progress, resolved, mean hours to resolve;
  - recurrence;
  - coverage: sessions, observations, reported capture distance;
  - processing status counts;
  - `includesSynthetic`.

  It reads the same SQL views (`issue_summary`, `session_coverage`, migration `0002`) as the QuickSight export, so the web dashboard and QuickSight agree.
