# Asynchronous processing worker

Two Lambdas, split around the VPC boundary so the vision provider is reachable without a NAT gateway:

- **Ingest** (`src/lambda-ingest.ts`, outside the VPC). Triggered by S3 `ObjectCreated`:
  - `sessions/*.jpg`: read the image, call the vision provider, validate the result against the shared `Detection` schema, then hand it to Persist.
  - `work-orders/*/resolution/*.jpg`: record the "after" image upload only (no inference).
- **Persist** (`src/lambda-persist.ts`, inside the VPC): all database writes, in one transaction each:
  - claim the observation (`PROCESSING`);
  - store the detection or an explicit `FAILED` code;
  - link the observation to the nearest OPEN issue of the same type within 25 m, or create a new issue (tagged with the NCR city when its boundary contains the point);
  - re-score the issue (`risk.v0`).

**Vision provider:** `src/gemini.ts`, set by `VISION_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.1-flash-lite`.
- The key lives only in the Secrets Manager secret `VisionProviderApiKey…` and is cached for 5 minutes.
- Structured JSON output uses `responseMimeType` + `responseJsonSchema`.
- `schemaVersion` and `modelVersion` are set by the server, not the model.

**Failure codes:**

| Code | Meaning |
| --- | --- |
| `PROVIDER_NOT_CONFIGURED` | No key in the secret |
| `PROVIDER_ERROR` | Gemini returned an HTTP error |
| `PROVIDER_TIMEOUT` | Gemini didn't answer in time |
| `INVALID_MODEL_OUTPUT` | The response failed schema validation |
| `IMAGE_TOO_LARGE` / `IMAGE_UNREADABLE` | The image couldn't be processed |

A failure is never turned into a detection.

**Idempotency:** duplicate S3 deliveries are skipped (`ALREADY_COMPLETED` / `IN_PROGRESS`), a `PROCESSING` row older than 5 minutes is retaken, and there is one detection per observation (enforced by the database). Persist errors are rethrown so Lambda's async retry re-delivers the event.

Tests: `test/ingest.test.ts` and `test/gemini.test.ts` (unit, no network); `test/processing.db.test.ts` (PostGIS).
