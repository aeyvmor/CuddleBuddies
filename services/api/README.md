# API service

TypeScript on Node.js. This first slice exposes the officer review and work-order operations; the rest of the contract (sessions, upload URL, observation route, lists, resolution evidence, analytics) is still to do. Contracts: [`docs/api/contract-v0-proposal.md`](../../docs/api/contract-v0-proposal.md) and `packages/contracts`. Image bytes never pass through this API.

## Implemented operations (role `OFFICER`)

| Operation | Success | Notable errors |
| --- | --- | --- |
| `GET /issues/{id}` | `200` issue, latest score breakdown, newest 50 observations with detections/processing state, work orders | `404 NOT_FOUND` |
| `POST /issues/{id}/work-orders` | `201` created / `200` idempotent replay | `409 ISSUE_NOT_OPEN`, `ACTIVE_WORK_ORDER_EXISTS`, `RISK_ASSESSMENT_MISMATCH`, `IDEMPOTENCY_CONFLICT` |
| `PATCH /work-orders/{id}` | `200` (same-status is a no-op) | `409 INVALID_TRANSITION`, `WORK_ORDER_CLOSED` |

Every error uses `{ error: { code, message, requestId, details? } }`. Unexpected failures return `500 INTERNAL_ERROR` without stack traces or SQL. Responses are checked against the shared Zod schema before they are sent.

Evidence is returned as `{ status: "UNAVAILABLE", reason: "SIGNER_NOT_CONFIGURED" | "NOT_UPLOADED" }` until the S3 presigned-GET signer is wired to the deployed bucket. Object keys are never returned.

## Auth boundary

- `ASTIG_AUTH_MODE=jwt`: trusts only claims verified by an API Gateway JWT authorizer (`sub`, `cognito:groups`). The Cognito/authorizer setup is still an open team decision.
- `ASTIG_AUTH_MODE=local-dev`: trusts `x-astig-dev-subject` and `x-astig-dev-roles` headers. This is for local development only and refuses to start inside Lambda or with `NODE_ENV=production`. **Do not expose it on a network.**

## Run locally

```text
npm run db:up && npm run db:reset
npm run api:dev            # http://127.0.0.1:3001 (loopback only)
```

Example (PowerShell):

```text
$h = @{ "x-astig-dev-subject" = "demo-officer-01"; "x-astig-dev-roles" = "OFFICER" }
Invoke-RestMethod http://127.0.0.1:3001/issues/5e3d0004-0000-4000-8000-000000000001 -Headers $h
```

## Tests

`npm test` covers auth, validation, and error-envelope behaviour without a database. `npm run test:db` runs the HTTP flows against a fresh PostGIS database: idempotent and concurrent creates, invalid transitions, closed work orders, issue resolution, and audit events.

`src/lambda.ts` adapts API Gateway HTTP API (payload v2) events. It is not deployed yet.
