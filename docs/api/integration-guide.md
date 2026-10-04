# ASTIG integration guide (web dashboard + mobile client)

Everything needed to connect `apps/web` and `apps/mobile` to the deployed backend. Shapes are defined in `packages/contracts` (Zod, `camelCase`); field-level notes are in [`contract-v0-proposal.md`](contract-v0-proposal.md).

## Endpoints (dev, ap-southeast-1)

| Setting | Value |
| --- | --- |
| API base URL | `https://2jpf5wobhl.execute-api.ap-southeast-1.amazonaws.com` |
| Cognito region | `ap-southeast-1` |
| Cognito user pool | `ap-southeast-1_uYQoBKBkj` |
| Cognito app client (public, no secret) | `7dgk8feqomk5d5q0vr81fp7m86` |
| Web app (Vercel, owner's account; auto-deploys from `main`) | `https://astig-xi.vercel.app` |
| Allowed browser origins (CORS) | `https://astig-xi.vercel.app`, `http://localhost:5173`, `http://localhost:4173` |

These are not secrets; every API call still needs a valid login. They are also exported as `ASTIG_DEV` from `@astig/api-client`.

**Demo accounts:**
- `demo-officer` (web dashboard)
- `demo-operator` (mobile capture)
- `demo-admin` (both roles)

The passwords are in the owner's git-ignored `secrets/demo-accounts.local.md`; ask for them privately, never in a commit or a group chat. Self sign-up is off.

**Vercel:** the project lives in the owner's Vercel account (root directory `apps/web`; install `cd ../.. && npm ci --workspace @astig/web --include-workspace-root=false`; build `npm run build`; output `dist`). Only `https://astig-xi.vercel.app` is allowed by CORS. Preview URLs (`astig-<hash>.vercel.app`) are blocked on purpose, so test against production or localhost. The origins live in `infra/aws/cdk.json` (`webOrigins`).

## Auth

1. Sign in with Cognito `USER_PASSWORD_AUTH`. `CognitoAuth` in `@astig/api-client` does this over plain `fetch`, with no AWS SDK.
2. Send `Authorization: Bearer <accessToken>` on every request. Tokens last 1 hour; `getAccessToken()` refreshes automatically, and refresh tokens last 7 days.
3. Roles come from the Cognito groups `OFFICER` and `OPERATOR`. The API enforces them: a missing or expired token gets `401`, the wrong role gets `403`.
4. Keep tokens in memory on the web for the demo; on mobile use `expo-secure-store` (a `TokenStore` adapter). Never log tokens.

## Web dashboard (OFFICER)

The web app already has an `ApiClient` interface and a mock. Swap in an HTTP implementation backed by `@astig/api-client` (it's an npm workspace package, so `"@astig/api-client": "0.0.0"`):

```ts
import { ASTIG_DEV, AstigClient, CognitoAuth, newId } from "@astig/api-client";

const auth = new CognitoAuth({ region: ASTIG_DEV.cognitoRegion, clientId: ASTIG_DEV.cognitoClientId });
const api = new AstigClient({ baseUrl: ASTIG_DEV.baseUrl, getToken: () => auth.getAccessToken(), onUnauthenticated: () => showLogin() });

await auth.signIn(username, password);                       // or a NEW_PASSWORD_REQUIRED challenge
const { items, nextCursor, areaNames } = await api.listIssues({ status: "OPEN", bbox: [120.9, 14.5, 121.1, 14.7] });
const detail = await api.getIssue(items[0].issue.id);         // evidence URLs are valid ~5 min; refetch to refresh
const { workOrder } = await api.createWorkOrder(detail.issue.id, {
  idempotencyKey: newId(),                                    // generate once per click; reuse on retry
  riskAssessmentId: detail.riskAssessment!.id,                // the score the officer reviewed
  assignedTeam: "Drainage Maintenance (demo)",
});
await api.updateWorkOrder(workOrder.id, { status: "IN_PROGRESS" });
await api.updateWorkOrder(workOrder.id, { status: "RESOLVED", notes: "Grate cleared" });
const summary = await api.analyticsSummary();
```

**Optional "after" photo (requirement 12):** once a work order is `IN_PROGRESS` or `RESOLVED`, call `const ev = await api.createResolutionEvidence(woId, { clientEvidenceId: newId(), contentType: "image/jpeg", contentLengthBytes: file.size, note })`, then `await api.uploadImage(ev.upload!, file)`. It then appears in `getIssue(...).resolutionEvidence` (the field is optional, so older code keeps working). Limit: 5 per work order.

**Field reports (web, 2026-10-04):** "Mark In progress" and "Mark Resolved" open a modal field report (`FieldReportDialog`):
- crew on site, findings or work done, an on-site confirmation, and optional JPEG photos;
- START sends `PATCH` with `{ status: "IN_PROGRESS", notes, assignedTeam }`, then uploads photos through `resolution-evidence`;
- RESOLVE uploads photos first, then sends `PATCH { status: "RESOLVED", notes }`;
- notes are appended with a UTC stamp and capped at 2000 characters, keeping the newest text.

It needs no extra API: it uses the existing work-order and resolution-evidence routes.

**UI rules from the contract:**
- Show `isSynthetic` / `includesSynthetic` as a demo-data badge.
- Show `UNKNOWN` score inputs as "unknown", never as 0. `knownCapTotal` is the maximum the score could reach from measured inputs.
- Show `evidence.status === "UNAVAILABLE"` with its reason.
- Show `processingStatus: "FAILED"` with `processingError.code`, never as a detection.
- Map `samplingMethod` to its label: `DASHCAM_REPLAY` is "Dashcam replay (recorded footage)".
- AI fields are advisory. Creating a work order is the officer's decision.

## Mobile capture (OPERATOR)

**Status (2026-10-04 08:15): connected.** `apps/mobile/src/api/` (copied client, secure token store, sign-in) uploads live captures; first real captures processed in Taguig.

`apps/mobile` is outside the npm workspaces. Either copy `packages/api-client/src/*.ts` into the app, or call the endpoints directly with the same shapes. The capture records it already builds match `ObservationCaptureRequest` (checked: 600/600 valid).

```text
1. POST /sessions                      { clientSessionId (new UUID, stored locally), deviceId, vehicleId, startedAt, startLocation }
2. per capture (from the offline queue, oldest first):
   a. POST /sessions/{sessionId}/observations   ObservationCaptureRequest (clientObservationId generated at capture time)
   b. POST /upload-url                          { observationId, contentType: "image/jpeg", contentLengthBytes }
   c. PUT  <url>                                body = JPEG bytes, header content-type: image/jpeg (exact byte length)
3. PATCH /sessions/{sessionId}         { status: "ENDED", endedAt }
```

- **Team device ids (registered, non-synthetic):** phone `ba6abd4c-13a1-4c81-814c-de9e4baa29aa`, car `a6087bec-3fd1-4c10-a6d8-7c2acbf87375`.
- **Retries are safe:** every call is idempotent on the client-generated ids. Keep a queue item until step 2c succeeds. `409 ALREADY_UPLOADED` from `/upload-url` means the image is already stored, so treat it as done. `AstigClient.submitCapture()` does a–c, including that rule.
- **Upload URLs expire after 5 minutes.** If the PUT fails with 403, request a new URL rather than retrying the old one.
- **Images:** JPEG, at most 10 MiB. The 3060×4080 camera photo is large; downscaling to around 1600 px on the long side (quality ~0.8) speeds uploads and Gemini processing.
- **Ended sessions:** a session that has ended still accepts queued captures whose `capturedAt` is before `endedAt`, so the offline queue can drain later.
- **Distance:** set `samplingMethod` truthfully (`GPS_DISTANCE`, `VIO_DISTANCE` only if it's genuinely trustworthy, or `MANUAL` with `distanceFromPreviousM: null`). Set `horizontalAccuracyM` to the device's value, or `null` when the device doesn't report one.
- After upload, the worker runs Gemini (about 2 s). The capture appears in the web app as an issue if something was detected, or as `COMPLETED`/`FAILED` in the processing counts.
- React Native: use `newId()` (needs `crypto.getRandomValues`; add `react-native-get-random-values` if missing) and upload `Blob`s from `fetch(fileUri).then(r => r.blob())`.

## Errors

`{ "error": { "code", "message", "requestId", "details?" } }`. `AstigApiError` exposes `status`, `code`, `requestId` and `retryable`.

| Code | Meaning / UI action |
| --- | --- |
| `VALIDATION_FAILED` 400 | Show `details[].path/message`; fix the input |
| `UNAUTHENTICATED` 401 / `FORBIDDEN` 403 | Show the login screen / "not allowed for your role" |
| `NOT_FOUND` 404 | Stale id; refresh the list |
| `INVALID_TRANSITION`, `WORK_ORDER_CLOSED`, `ISSUE_NOT_OPEN`, `ACTIVE_WORK_ORDER_EXISTS`, `RISK_ASSESSMENT_MISMATCH` 409 | Refetch the issue and show the message |
| `IDEMPOTENCY_CONFLICT` 409 | Same id reused with different data: generate a new id for a new action |
| `ALREADY_UPLOADED` 409 | Upload is done |
| `SERVICE_UNAVAILABLE` 503 / `INTERNAL_ERROR` 500 / 429 | Retry later (the client retries automatically) |

## Demo operations (backend owner)

- **Reset after a rehearsal:** invoke the admin Lambda with `{"action":"reset-demo","scope":"WORK_ORDERS","confirm":"RESET_DEMO_DATA"}`. This restores the seed work orders and reopens issues; captures and Gemini results are kept. Then invoke the analytics export and refresh QuickSight.
- `scope: "ALL"` also wipes captures and re-seeds (you'd have to replay the dashcam footage again).
- **Before the demo:** start the database if it was stopped (about 5 minutes).
