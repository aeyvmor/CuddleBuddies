# API contract outline

This is a boundary checklist, not a frozen OpenAPI document. Agree exact field names, auth, response/error format, and versioning with mobile/web/backend owners before parallel implementation. Keep the source machine-readable once the stack is selected.

The backend owner's concrete draft is [contract v0 proposal](contract-v0-proposal.md) (pending team confirmation), with Zod schemas in `packages/contracts/`. **To connect the apps, start with the [integration guide](integration-guide.md)** and the typed client in `packages/api-client/`.

## Suggested operations

| Operation | Purpose |
| --- | --- |
| `POST /sessions` | Start session with device, vehicle, and start location |
| `PATCH /sessions/{id}` | End/update session |
| `POST /upload-url` | Request a short-lived, scoped S3 upload URL |
| `POST /sessions/{id}/observations` | Register capture metadata and idempotency key |
| `GET /observations` | Query observations with filters/pagination |
| `GET /issues` | Query map issues by area/status/severity/type |
| `GET /issues/{id}` | Issue, score components, evidence history, and work order |
| `POST /issues/{id}/work-orders` | Officer-approved work-order creation |
| `GET /work-orders` | Filter/paginate work orders |
| `PATCH /work-orders/{id}` | Validated lifecycle/assignment/notes update |
| `POST /work-orders/{id}/resolution-evidence` | Register resolution image evidence |
| `GET /analytics/summary` | Aggregated operational metrics |

## Capture metadata minimum

Session ID, device/vehicle ID, client observation ID/idempotency key, UTC capture timestamp, latitude/longitude, available horizontal accuracy, image object key, schema version, and ordering information. Do not accept arbitrary S3 keys from clients; scope object keys to an authorized session.

## Detection output minimum

`infrastructure_visible`, `issue_type`, `obstruction_type`, nullable `blockage_percent`, `severity_estimate`, `confidence` in `[0,1]`, `evidence_description`, `requires_human_review`, model version, and schema version. Restrict enums, numeric bounds, string lengths, and unexpected properties at the trust boundary.

## API behavior

- Use a consistent error envelope with stable machine-readable code and safe user message.
- Validate request body, identifiers, coordinates, pagination, and state transitions.
- Make retries safe with idempotency keys; return existing operation result for a duplicate.
- Paginate list endpoints; never return unrestricted raw evidence or unbounded result sets.
- Provide evidence access using short-lived authorized URLs, not public object URLs.
- Do not expose provider secrets, stack traces, private bucket paths, or raw personal data in normal logs/responses.
- Record async state (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` or an agreed equivalent); inference failure is not a successful detection.
