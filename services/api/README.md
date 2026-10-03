# API service

TypeScript on Node.js, deployed as one Lambda behind API Gateway HTTP API with a Cognito JWT authorizer. Contracts: `packages/contracts` (Zod) and [`docs/api/contract-v0-proposal.md`](../../docs/api/contract-v0-proposal.md). **Client integration: [`docs/api/integration-guide.md`](../../docs/api/integration-guide.md)** and the typed client `packages/api-client`. Image bytes never pass through this API; it only issues short-lived presigned S3 URLs.

## Operations

| Role | Operation | Notes |
| --- | --- | --- |
| OFFICER | `GET /issues` | Filters `issueType`, `severity`, `areaName`, `status`, `workOrderStatus` (incl. `NONE`), `bbox`, `limit` ≤ 200, `cursor`; returns `areaNames` |
| OFFICER | `GET /issues/{id}` | Issue, latest score breakdown, newest 50 observations with detection/processing state and presigned evidence URLs (~5 min), work orders, resolution evidence |
| OFFICER | `POST /issues/{id}/work-orders` | Officer approval; idempotent on `idempotencyKey` |
| OFFICER | `PATCH /work-orders/{id}` | `OPEN → IN_PROGRESS → RESOLVED`; same-status is a no-op |
| OFFICER | `POST /work-orders/{id}/resolution-evidence` | "After" photo presigned PUT; `IN_PROGRESS`/`RESOLVED` only, max 5 |
| OFFICER | `GET /analytics/summary` | Same SQL views as the QuickSight export |
| OPERATOR | `POST /sessions`, `PATCH /sessions/{id}` | Client-generated session id (offline-safe) |
| OPERATOR | `POST /sessions/{id}/observations` | Capture metadata; idempotent on `clientObservationId` |
| OPERATOR | `POST /upload-url` | Presigned PUT; signed content-type and exact length; `409 ALREADY_UPLOADED` means done |

Errors use `{ error: { code, message, requestId, details? } }`. Unexpected failures return `500 INTERNAL_ERROR` without stack traces or SQL. Every response is validated against the shared schema before it is sent.

## Auth

- Deployed: `ASTIG_AUTH_MODE=jwt`, which trusts only claims verified by the API Gateway JWT authorizer (`sub`, `cognito:groups`). An unauthenticated `OPTIONS` route answers only CORS preflights.
- Local: `ASTIG_AUTH_MODE=local-dev` trusts the `x-astig-dev-subject` and `x-astig-dev-roles` headers. It refuses to start in Lambda or with `NODE_ENV=production`. **Never expose it on a network.**

## Run locally

```text
npm run db:up && npm run db:reset
npm run api:dev            # http://127.0.0.1:3001 (loopback only)
```

## Tests

`npm test` runs auth, validation, error envelope, and S3 presigning tests. `npm run test:db` runs the HTTP flows against fresh PostGIS: issue list and analytics, sessions, capture and upload URL, idempotent and concurrent writes, work-order transitions, resolution evidence.
