# Prompt: connect the web dashboard (and mobile) to the live backend

Paste the block below into your coding agent (Kiro, Claude Code, Copilot, …) from the repository root. It's self-contained. Do the web part first; it's what the demo depends on.

Before you start, get the `demo-officer` and `demo-operator` passwords **privately** from the backend owner. Put them only in a git-ignored `apps/web/.env.local` if you need them for local testing; never commit them.

```text
You are connecting ASTIG's existing React + Vite web dashboard (apps/web) to the deployed backend.
The backend is finished and live; do NOT change anything outside apps/web (and apps/mobile in part B)
unless the step says so. If something in the backend seems wrong, stop and report it instead of
working around it.

Read first: AGENTS.md, docs/api/integration-guide.md (authoritative), packages/api-client/src/*.ts,
packages/contracts/src/{issue,issue-list,work-order,resolution,errors,score}.ts, apps/web/README.md,
apps/web/src/api/{client.ts,types.ts,mockClient.ts}.

Facts (from the guide; do not invent others):
- API: https://2jpf5wobhl.execute-api.ap-southeast-1.amazonaws.com  (CORS allows only
  https://astig-xi.vercel.app, http://localhost:5173, http://localhost:4173)
- Cognito: region ap-southeast-1, user pool ap-southeast-1_uYQoBKBkj, public app client 7dgk8feqomk5d5q0vr81fp7m86
  (exported as ASTIG_DEV from @astig/api-client). Roles come from Cognito groups OFFICER / OPERATOR.
- Every call needs `Authorization: Bearer <access token>`; CognitoAuth handles sign-in and refresh.
- Live data: 4 issues, including a real "BLOCKED_DRAIN" in "Manila" from replayed dashcam footage.

PART A — web dashboard (OFFICER)
1. Add "@astig/api-client": "0.0.0" to apps/web/package.json dependencies (root npm workspace) and run
   `npm install` at the repo root. Keep package-lock.json changes.
2. Implement an HTTP ApiClient (e.g. apps/web/src/api/httpClient.ts) that satisfies the existing
   ApiClient interface using AstigClient. Map listIssues to GET /issues: the backend now returns
   { items, nextCursor, areaNames }, and its IssueListItem matches the web's local [gap G1] type.
   Replace the local gap types with the ones from @astig/contracts (IssueListItem, IssueListResponse)
   and delete the resolved [gap G1–G5, G7] notes. Keep G6 (recommendation band) as an open gap.
   Use areaNames from the response for the area filter instead of collecting them client-side.
3. Choose the client with Vite env: VITE_ASTIG_API=mock|live (default live in production builds,
   mock in tests). Do not hardcode passwords. Keep mockClient for tests and offline demo.
4. Add a minimal, accessible sign-in screen (labels, keyboard, visible errors) using
   CognitoAuth.signIn. Handle the NEW_PASSWORD_REQUIRED challenge with a "set new password" form
   (completeNewPassword). Keep tokens in memory only. Show who is signed in and a sign-out button.
   On AstigApiError with code AUTH_REQUIRED/UNAUTHENTICATED, return to sign-in. FORBIDDEN → "This
   account can't access the dashboard (needs OFFICER)".
5. Work orders: generate idempotencyKey with newId() once per user action and reuse it if the same
   action is retried. Send riskAssessmentId = detail.riskAssessment.id (the score the officer saw).
   After create/update, refetch the issue. Show 409 messages (INVALID_TRANSITION, ACTIVE_WORK_ORDER_EXISTS,
   ISSUE_NOT_OPEN, WORK_ORDER_CLOSED) inline, not as crashes.
6. Optional "after photo" on IN_PROGRESS/RESOLVED work orders: file input (JPEG only, ≤10 MiB) →
   createResolutionEvidence → uploadImage(ev.upload, file) → refetch; render detail.resolutionEvidence
   (field is optional).
7. Evidence images use short-lived presigned URLs (~5 min). If an <img> fails to load, refetch the
   issue once to get fresh URLs. Show evidence.status UNAVAILABLE with its reason.
8. Keep the honesty rules already in the UI: demo/synthetic badge (isSynthetic / includesSynthetic),
   UNKNOWN score inputs shown as "unknown" (never 0) with knownCapTotal, FAILED processing shown with
   processingError.code and never as a detection, samplingMethod labels (DASHCAM_REPLAY = "Dashcam
   replay (recorded footage)"), AI advisory wording, location uncertainty in metres.
9. Analytics: show GET /analytics/summary (counts by type/severity/area, open vs resolved work orders,
   mean resolution hours, recurrence, coverage, processing counts, includesSynthetic badge).
10. Verify: `npm run typecheck:web`, `npm run test:web`, `npm run build:web` must pass. Add tests for
   the HTTP client mapping (fake fetch) and the sign-in/new-password flow. Then run
   `npm run web:dev`, sign in as demo-officer at http://localhost:5173, and walk the demo: open the
   Manila drain → see images, Gemini description, score breakdown → create work order →
   IN_PROGRESS → RESOLVED. Report anything that fails with the requestId from the error.
11. Commit only apps/web (+ package-lock.json) with a clear message, pull, and push to main. Vercel
   (https://astig-xi.vercel.app) redeploys automatically; check the deployed site the same way.
   After rehearsing, tell the backend owner so they can run reset-demo.

PART B — mobile capture (OPERATOR), only after Part A works
- apps/mobile is a separate Expo project (not a workspace). Copy packages/api-client/src/*.ts into
  apps/mobile/src/api/ (note the source in a header comment) or call the endpoints directly.
- Flow (see the guide): POST /sessions with a stored clientSessionId and the registered team device
  ba6abd4c-13a1-4c81-814c-de9e4baa29aa / vehicle a6087bec-3fd1-4c10-a6d8-7c2acbf87375 → for each
  queued capture: registerObservation (existing capture builder output) → createUploadUrl → PUT the
  JPEG (downscale to ~1600 px long edge) → mark done; treat 409 ALREADY_UPLOADED as done; on S3 403
  request a new URL. End the session with PATCH /sessions/{id}.
- Use a CSPRNG for ids (react-native-get-random-values if crypto.getRandomValues is missing) and
  expo-secure-store for tokens. samplingMethod must stay truthful (MANUAL → distanceFromPreviousM null).
- Verify on the phone: one session with 2–3 captures appears as processed observations (backend owner
  can confirm via admin `status`). Keep the existing mobile tests green (`npm test` in apps/mobile).

Report at the end: files changed, checks run with results, what you verified live, anything blocked.
```
