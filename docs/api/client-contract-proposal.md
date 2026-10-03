# Client contract proposal (for backend-owner review)

Status: **PROPOSAL, not approved.** This is written by the client owner (web + mobile). The backend owner should accept, amend, or reject each row, then encode the approved result as Zod schemas in `packages/contracts`. This document does not change [`contract.md`](contract.md), and the backend owner keeps ownership of it.

Today's web slice (`apps/web/src/api/types.ts`) runs only against an in-memory mock. Section 3 lists the decisions needed, ordered so you can answer each with a short reply such as "yes", "no" or a value.

Conventions used throughout (please confirm as Q2):
- JSON field names are `snake_case`.
- Times are UTC ISO-8601 strings ending in `Z`.
- Distances are in metres, with an `_m` suffix.
- Coordinates are WGS84 decimal degrees.
- IDs are opaque strings.
- `null` means "not available". A field that is absent is a contract error.

Traces: **R#** = `.kiro/specs/astig/requirements.md` item; **C** = `docs/api/contract.md`; **D** = `.kiro/specs/astig/design.md`; **M** = `docs/data/model.md`; **P** = `docs/operations/privacy-and-demo-data.md`.

---

## 1. Web dashboard

### 1.1 Reads: `GET /issues`, `GET /issues/{id}`

```json
{
  "items": [
    {
      "id": "iss_01J9...",
      "issue_type": "BLOCKED_DRAIN",
      "severity": "HIGH",
      "latitude": 14.5995,
      "longitude": 120.9842,
      "location_uncertainty_m": 10,
      "area_name": "Demo Zone A",
      "is_synthetic": true,
      "observation_count": 2,
      "recommendation": "Advisory: review for drain clearing. Weather and hazard inputs were not available.",
      "risk": {
        "total": 46,
        "formula_version": "prototype-v1",
        "components": [
          { "factor": "severity",   "status": "MEASURED",    "points": 28,   "cap": 35 },
          { "factor": "weather",    "status": "UNAVAILABLE", "points": null, "cap": 25 },
          { "factor": "recurrence", "status": "MEASURED",    "points": 12,   "cap": 20 },
          { "factor": "hazard",     "status": "UNAVAILABLE", "points": null, "cap": 10 },
          { "factor": "exposure",   "status": "MEASURED",    "points": 6,    "cap": 10 }
        ]
      },
      "work_order": null
    }
  ],
  "next_cursor": null
}
```

`GET /issues/{id}` returns the same object without the `items`/`next_cursor` wrapper, plus `observations[]`:

```json
{
  "id": "obs_01J9...",
  "captured_at": "2026-10-03T01:05:00Z",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "horizontal_accuracy_m": 8,
  "processing_status": "FAILED",
  "error_code": "PROVIDER_UNAVAILABLE",
  "image_url": null,
  "image_url_expires_at": null,
  "detection": null
}
```

When `processing_status` is `COMPLETED`, `detection` uses the field names listed under "Detection output minimum" in C, unchanged. Those are `infrastructure_visible`, `issue_type`, `obstruction_type`, `blockage_percent`, `severity_estimate`, `confidence`, `evidence_description`, `requires_human_review`, `model_version` and `schema_version`.

### 1.2 Field-by-field review

Each row shows what the web app currently assumes, the smallest definition I propose, and what breaks in the UI if you choose differently.

| # | Field / behavior | Web assumes now | Traces to | Proposed definition | If backend differs |
| --- | --- | --- | --- | --- | --- |
| W1 | `severity` (issue) and `severity_estimate` (detection) | `LOW \| MEDIUM \| HIGH \| CRITICAL` | C "Restrict enums"; R5, R10 | Same 4 values for both fields. Issue `severity` = the backend's choice of source (Q9) | The severity filter, the colour tokens, and a test's `CRITICAL` filter all need new values. Unknown values render unstyled. |
| W2 | `issue_type` | `BLOCKED_DRAIN \| STANDING_WATER \| DEBRIS \| DAMAGED_ROAD` | C; R5 | Keep these 4 and add `OTHER` | The type filter options are hard-coded, and the labels are derived from the codes. |
| W3 | `obstruction_type` | Free string, displayed raw (seed uses `"debris"`/`"synthetic"`) | C detection minimum (named, no values) | `NONE \| DEBRIS \| SEDIMENT \| VEGETATION \| WATER \| VEHICLE \| OTHER`. Not nullable: use `NONE`. | Nothing breaks (displayed as text), but an unrestricted string violates C "Restrict enums". |
| W4 | `area_name` | `string \| null`; `null` shown as "Area unknown" | R6 "when data permits"; R13 area | `area_name: string \| null`. `null` when no polygon matched; never a guess. | The area filter and the "Area unknown" display. |
| W5 | `location_uncertainty_m` (issue) | `number \| null`. The UI says "not an exact asset position". | R6; M "preserve accuracy" | The maximum `horizontal_accuracy_m` among the issue's linked observations; `null` if any is unknown. | The display copy only, but R6 needs *some* uncertainty field. |
| W6 | `horizontal_accuracy_m` (observation) | `number \| null` | C "available horizontal accuracy" | Device-reported 68% radius in metres; `null` if the device gave none | The evidence card shows "not reported" for `null`. |
| W7 | `is_synthetic` | `boolean` on each issue. Drives the "SYNTHETIC DEMO DATA" badge. | P "Mark generated demo observations clearly in the UI and analytics"; AGENTS | `is_synthetic: boolean` on **issue and observation**. Seeds set `true`. Also exported to analytics. | **Demo-labeling requirement fails.** Synthetic records would appear unlabeled. |
| W8 | `recommendation` | Non-null advisory string | R10 lists "recommendation" | `string \| null`. Backend picks a deterministic template by type/score, always beginning "Advisory:", and never tells anyone to dispatch. | If removed, R10 is unmet. If `null`, the web will hide the paragraph (needs a one-line change). |
| W9 | `risk` shape | `{ total, formula_version, components[] }`. Each component is `{ factor, status, points, cap }`. | R8; D "persist each component and formula_version"; M "distinguish missing data from zero risk" | As in the example above. `factor` is one of the 5 R8 factors. `status` is `MEASURED \| UNAVAILABLE`. `points` is weighted and capped, `null` iff `UNAVAILABLE`. `total` = sum of measured points (0–100 integer). | Without `status`, the UI cannot tell "unavailable" from 0, so it would violate M. A different factor key breaks the table labels. |
| W10 | `error_code` (observation) | `string \| null`. Shown inside "Processing failed (…)" | C "inference failure is not a successful detection"; AGENTS "keep errors visible" | `null` unless `FAILED`. Values: `INVALID_IMAGE \| PROVIDER_UNAVAILABLE \| PROVIDER_TIMEOUT \| INVALID_MODEL_OUTPUT \| INTERNAL`. No raw provider text. | The UI shows the code verbatim, so any stable value works. A missing code shows "unknown error". |
| W11 | `processing_status` | `PENDING \| PROCESSING \| COMPLETED \| FAILED` | C | Confirm as-is | The failed/pending messages in the evidence card. |
| W12 | Error envelope | Client expects `{ code, message }` | C "consistent error envelope with stable code and safe user message" | Body `{ "error": { "code": "…", "message": "…" } }`. Codes and HTTP statuses in 1.3. | The UI displays `message` and branches on nothing else yet. The HTTP client will unwrap `error`. |
| W13 | Pagination for `GET /issues` | **None.** The mock returns all rows (see contradiction X2). | C "Paginate list endpoints… never unbounded" | `?limit=` (default 50, max 200) and `?cursor=`. Response `{ items, next_cursor }`, where `next_cursor` is `null` on the last page. Filters: `severity`, `issue_type`, `area_name`, `work_order_status` (adds `NONE`). | The list/map need a "load more" control, and area options need another source (Q12). |
| W14 | `image_url` issuance/expiry | `string \| null` on each observation. Issuance and expiry are undefined. | C "short-lived authorized URLs, not public object URLs"; P | Returned only in `GET /issues/{id}`, and only to roles allowed to see evidence (Q1). Presigned S3 GET, TTL 300 s, plus `image_url_expires_at`. `null` for viewers, synthetic records without an image, or `FAILED` with no object. On `<img>` error or after expiry, the web refetches the detail. | If URLs are long-lived, that breaks P. If a different endpoint issues them, the web needs one extra call per image. |
| W15 | Role / auth model | Demo dropdown `VIEWER \| OFFICER`. The mock rejects non-officer writes with `FORBIDDEN`. | R9 "authorized officer"; tasks "explicit authorization boundaries" | Bearer token in `Authorization` carrying role `VIEWER \| OFFICER \| OPERATOR`. `OPERATOR` covers mobile session and capture writes only. The server enforces every role. The dropdown becomes a demo sign-in per role. | The dropdown is the only role source today, so the web must read the role from the session or token instead. |
| W16 | Work-order create | `POST /issues/{id}/work-orders {assignee, notes}`. Duplicate → `WORK_ORDER_EXISTS`. | R9, R11; C "return existing operation result for a duplicate" | The request adds an `Idempotency-Key` header. A repeat with the same key returns the existing work order with `200`. A *different* key while a non-`RESOLVED` work order exists returns `409 WORK_ORDER_EXISTS`. Response adds `created_by`. | See contradiction X1. |
| W17 | Work-order update | `PATCH /work-orders/{id} {status?, assignee?, notes?}` | R11 | As-is. The server rejects non-adjacent transitions with `409 INVALID_TRANSITION`. | Nothing breaks if the codes match 1.3. |

### 1.3 Error codes (web currently uses the four marked ✓)

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Body/query fails schema; `message` names the field, not the value |
| `UNAUTHENTICATED` | 401 | Missing/expired token |
| `FORBIDDEN` ✓ | 403 | Role lacks permission (e.g. viewer creates a work order) |
| `NOT_FOUND` ✓ | 404 | Unknown or unauthorized-to-see ID |
| `WORK_ORDER_EXISTS` ✓ | 409 | Issue already has a non-resolved work order (different idempotency key) |
| `INVALID_TRANSITION` ✓ | 409 | Not `OPEN→IN_PROGRESS` or `IN_PROGRESS→RESOLVED` |
| `IDEMPOTENCY_CONFLICT` | 409 | Same idempotency key reused with a different payload |
| `INTERNAL` | 500 | Unexpected; no stack trace or bucket path in `message` |

### 1.4 Contradictions found in the current web slice (listed, not fixed)

| # | Where | Conflicts with | Smallest fix after approval |
| --- | --- | --- | --- |
| X1 | `mockClient.createWorkOrder` returns `WORK_ORDER_EXISTS` on a retry, and there is no idempotency key | C "Make retries safe with idempotency keys; return existing operation result for a duplicate" | Send `Idempotency-Key`; the mock returns the existing work order for the same key (W16) |
| X2 | `ApiClient.listIssues` is unpaginated, and `App.tsx` lists *all* issues unfiltered just to build the area dropdown | C "Paginate list endpoints… never… unbounded result sets" | Cursor pagination (W13) plus a bounded area-option source (Q12) |
| X3 | `mockClient.getIssue` returns `observations` (including `image_url`) to `VIEWER`, and the UI renders them | P "Restrict raw-evidence access to the demo roles that need it"; AGENTS "Keep public map fields separate from restricted image evidence" | Server returns `image_url: null` for non-evidence roles (W14). No image is actually exposed today because all seeds use `null`. |

There are also three requirement gaps that the slice doesn't cover yet. These are not contradictions, just unbuilt:
- **R10 "status".** The issue has no status separate from the work-order state (Q8).
- **R9 audit.** Nothing records which officer approved creation. W16 adds `created_by` for this.
- **R12 resolution evidence.** `POST /work-orders/{id}/resolution-evidence` has no client yet (Q22).

---

## 2. Mobile capture client

Upload order I propose (Q14). The client registers the observation metadata *before* uploading the bytes. That way the worker's S3 event always finds its metadata, and the server, not the client, chooses the object key (C "Do not accept arbitrary S3 keys from clients").

```text
POST /sessions → POST /sessions/{id}/observations → POST /upload-url → PUT bytes to S3 → (S3 event → worker)
```

Every step is retry-safe with client-generated UUIDs, so the offline queue can replay from any point.

### 2.1 `POST /sessions` (role `OPERATOR`)

```json
{
  "client_session_id": "6f1c2b9e-1d1a-4f53-9a77-0c2c5b8a9e10",
  "device_id": "dev_demo_01",
  "vehicle_id": "veh_demo_01",
  "started_at": "2026-10-03T01:00:00Z",
  "start_location": { "latitude": 14.5990, "longitude": 120.9840, "horizontal_accuracy_m": 6 },
  "sampling_method": "GPS_DELTA",
  "sampling_interval_m": 7,
  "app_version": "0.1.0",
  "schema_version": "capture-v1"
}
```

Response `201` (or `200` with the same body when the same `client_session_id` is replayed):

```json
{ "id": "ses_01J9...", "status": "ACTIVE", "started_at": "2026-10-03T01:00:00Z", "ended_at": null }
```

| Field | Type | Rule / trace |
| --- | --- | --- |
| `client_session_id` | UUID | Idempotency key (C) |
| `device_id`, `vehicle_id` | string | Must already exist. Seeded demo records (Q16). R1. |
| `started_at` | UTC instant | R1, R2 |
| `start_location` | `{latitude −90..90, longitude −180..180, horizontal_accuracy_m ≥0 \| null}` | R1. Out-of-range → `VALIDATION_FAILED`. |
| `sampling_method` | `VIO \| GPS_DELTA` | **Explicit distance source.** `GPS_DELTA` is never shown or stored as VIO (R-caveat, mobile README). |
| `sampling_interval_m` | number 1–50 | R2 configurable; prototype default 7 |
| `schema_version` | string | AGENTS "versioned schemas" |

### 2.2 `PATCH /sessions/{id}`

```json
{ "status": "ENDED", "ended_at": "2026-10-03T01:42:00Z", "end_location": { "latitude": 14.6021, "longitude": 120.9875, "horizontal_accuracy_m": 9 } }
```

Response: the session object. Only `ACTIVE → ENDED` is allowed; anything else → `409 INVALID_TRANSITION`. Replaying an identical `ENDED` request returns `200` with no change. Observations may still be registered for an `ENDED` session as long as `captured_at ≤ ended_at`, because offline queue items drain after the trip ends.

### 2.3 `POST /sessions/{id}/observations` (metadata first)

```json
{
  "client_observation_id": "0b8f6a4e-7a7e-4b8a-9a35-3b1f8f1d2c44",
  "sequence_number": 12,
  "captured_at": "2026-10-03T01:05:00Z",
  "latitude": 14.5995,
  "longitude": 120.9842,
  "horizontal_accuracy_m": 8,
  "sampling_method": "GPS_DELTA",
  "distance_since_previous_m": 7.4,
  "distance_accuracy_m": null,
  "quality_flags": [],
  "content_type": "image/jpeg",
  "content_length_bytes": 412345,
  "schema_version": "capture-v1"
}
```

Response `201` (or `200` with the same body when `(session_id, client_observation_id)` already exists; a different payload → `409 IDEMPOTENCY_CONFLICT`):

```json
{ "id": "obs_01J9...", "processing_status": "PENDING", "image_uploaded": false }
```

| Field | Type | Rule / trace |
| --- | --- | --- |
| `client_observation_id` | UUID | Idempotency key, unique per session. R4 "retries do not create duplicate observations". |
| `sequence_number` | int ≥ 0 | Ordering information (C), monotonic per session |
| `captured_at` | UTC instant | ≥ session `started_at` and ≤ `ended_at` if ended |
| `latitude`, `longitude`, `horizontal_accuracy_m` | as 2.1 | C capture minimum; R6 |
| `sampling_method` | `VIO \| GPS_DELTA` | Per-capture copy, because it may change mid-session if VIO loses tracking |
| `distance_since_previous_m` | number ≥ 0 \| null | Distance measured by `sampling_method`; `null` for the first capture |
| `distance_accuracy_m` | number ≥ 0 \| null | `null` = not estimated. Never zero-filled. |
| `quality_flags` | array of `BLURRY \| DARK \| DUPLICATE` | R3 "marked or filtered". An empty array means the checks passed. Flagged items may still be sent. |
| `content_type` | `image/jpeg` | Validated again at upload-url issuance |
| `content_length_bytes` | int 1–5 000 000 | Bounds the presigned upload |

No `image_object_key` appears in this request, and that is deliberate. The server assigns the key at `/upload-url` and stores it with the observation. That satisfies C's "image object key" minimum without trusting a client-supplied key.

### 2.4 `POST /upload-url`

```json
{ "observation_id": "obs_01J9..." }
```

Response `200`:

```json
{
  "upload_url": "https://…presigned…",
  "method": "PUT",
  "required_headers": { "Content-Type": "image/jpeg" },
  "expires_at": "2026-10-03T01:15:00Z"
}
```

- **Key and URL.** The server derives the private object key from the session and observation; the client never sees a bucket path in logs. The URL TTL is 600 s and it is scoped to exactly that key, content type and length.
- **Repeat calls.** Calling again for the same observation returns a fresh URL for the same key, which is idempotent. The call fails with `409` if the object is already uploaded and processed.
- **Expiry.** If the client is offline past `expires_at`, it requests a new URL; nothing on the server needs cleaning up.
- **After upload.** The worker sets `processing_status` from the S3 event. The mobile client does not report "uploaded" itself.

---

## 3. Decisions needed (most blocking first)

Each line gives the proposed default. Reply "yes" or with an alternative.

1. **Auth and roles.** Is a bearer token with roles `VIEWER`, `OFFICER` and `OPERATOR` OK, with evidence images visible only to `OFFICER`? Which demo issuer: Cognito or a signed demo token? (W15, W14)
2. **Conventions.** Are the conventions at the top OK (`snake_case`, UTC `Z`, `_m` suffix, `null` versus absent)?
3. **Error envelope.** Is `{ error: { code, message } }` with the 1.3 code table OK? (W12)
4. **Severity enum.** `LOW | MEDIUM | HIGH | CRITICAL` for both issue and detection? (W1)
5. **Issue-type enum.** The four in W2 plus `OTHER`? (W2)
6. **`obstruction_type` enum.** The W3 list, non-null with `NONE`? (W3)
7. **Score component shape.** `{ factor, status: MEASURED|UNAVAILABLE, points|null, cap }`, factor keys as in W9, and `total` as the sum of measured points? (W9)
8. **Issue status.** Should an issue have its own `status` (R10 and C's "status" filter)? My proposal is no for the MVP: the `status` filter means work-order status, including `NONE`.
9. **Issue `severity` source.** Take the maximum `severity_estimate` across the issue's completed detections?
10. **Work orders per issue.** At most one non-`RESOLVED` work order per issue, with a new one allowed after resolution? (W16)
11. **Work-order idempotency.** `Idempotency-Key` header, with the same key returning the existing work order with `200`, plus a `created_by` field? (W16, X1)
12. **Area filter options.** Fixed list from the seed/pilot-area config, published in `packages/contracts` (no new endpoint)? (X2)
13. **Pagination.** Cursor-based, `limit` default 50 and max 200? (W13)
14. **Mobile call order.** Metadata first, then upload-url keyed by `observation_id`, then a server-assigned object key? (2.3, 2.4)
15. **`image_url`.** Inline in `GET /issues/{id}`, TTL 300 s, plus `image_url_expires_at`? (W14)
16. **Device and vehicle IDs.** Pre-seeded demo records, with no registration endpoint in the MVP? (2.1)
17. **Sampling fields.** `sampling_method: VIO|GPS_DELTA`, plus `distance_since_previous_m` and nullable `distance_accuracy_m` on each observation? (2.3)
18. **`is_synthetic`.** On both issue and observation, and exported to analytics? (W7)
19. **Failed-observation `error_code` values.** The W10 list? (W10)
20. **`recommendation`.** Nullable, from a deterministic backend template prefixed "Advisory:"? (W8)
21. **Issue `location_uncertainty_m`.** The maximum linked `horizontal_accuracy_m`, `null` if any is unknown? (W5)
22. **Resolution evidence.** Defer the client for `POST /work-orders/{id}/resolution-evidence` until Q14's upload pattern is approved, then reuse it?
23. **Quality flags.** `BLURRY | DARK | DUPLICATE`, with flagged frames still allowed to upload? (2.3)
