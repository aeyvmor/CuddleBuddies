# Shared contracts

Versioned Zod schemas, with TypeScript types inferred from them, for the API and for model output. Draft v0 is pending team confirmation; see [`docs/api/contract-v0-proposal.md`](../../docs/api/contract-v0-proposal.md).

| Module | Contents |
| --- | --- |
| `common.ts` | UUID, UTC instant (`Z` only), WGS84 coordinates, metres |
| `observation.ts` | Capture request (`observation-capture.v0`; the client never sends an S3 key), sampling method, processing status/error |
| `detection.ts` | Strict model-output schema (`detection.v0`): the trust boundary for vision output |
| `score.ts` | Score breakdown (`risk.v0`) with explicit `KNOWN`/`UNKNOWN` inputs |
| `issue.ts` | Issue detail response (`issue-detail.v0`), evidence access |
| `work-order.ts` | Work order, create/update requests and responses |
| `errors.ts` | Error envelope and stable error codes → HTTP status |

Import with `import { Detection } from "@astig/contracts"`. Validate untrusted input with `safeParse` at runtime; compile-time types alone are not enough. Coordinate field or enum changes with the client and worker owners before editing.
