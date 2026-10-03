# ASTIG team handoff

> Update this page at the end of each meaningful work session. Durable requirements/design live in `.kiro/specs/astig/` and `docs/`.

## Current state

- Repository contains the initial ASTIG planning/scaffold documentation.
- Team direction recorded: Android-only React Native; React + Vite + TypeScript web; TypeScript/Node API + worker.
- Recommended defaults documented: Expo development build (verify native VIO support), npm workspaces, Zod shared schemas, SQL migrations + `pg`, Docker PostGIS locally, and AWS CDK in TypeScript.
- User owns backend and AWS tasks, is new to AWS, and will work from an iPad; setup docs guide browser-based Console/CloudShell access without local AWS installation or long-lived keys.
- Street View is deferred for the MVP to avoid per-request billing and terms/setup overhead; use team-captured, synthetic, or explicitly licensed images.
- **Demo evidence (2026-10-04):** team-recorded Manila dashcam footage (no GPS → hand-traced routes) replayed through the real API by `tools/dashcam-replay` (`DASHCAM_REPLAY` sampling, demo device `isSynthetic`). Gemini live (`gemini-3.1-flash-lite`, key in Secrets Manager; **rotate it: it was pasted in chat**). Migration 0003 and 17 NCR city boundaries (OSM, ODbL) are loaded; new issues get a city name. Verified live with a synthetic test video. Runbook: `docs/operations/dashcam-demo-data.md`.
- **QuickSight (2026-10-04):** Enterprise account `aeyvmorqs`, one user changed from ADMIN_PRO to **ADMIN** (avoids the $250/month Pro fee), S3 access granted to the analytics bucket only. Datasets `ASTIG issues` and `ASTIG sessions` (SPICE, typed columns, lat/lon tagged) were created through the API. Dashboard `ASTIG Operations` published.
- Added pre-build setup checklist and four role-specific AI coding prompts.
- **Backend slice (deployed):** npm workspaces root; `packages/contracts` (Zod v0 draft); `packages/domain` (risk score, work-order transitions, object keys, issue matching); `database` (migration 0001, synthetic seed, scripts, admin Lambda); `services/api` (issue detail, work orders, sessions, observation registration, upload URL, presigned evidence reads); `services/worker` (ingest/persist, provider adapter defaulting to `PROVIDER_NOT_CONFIGURED`, issue association, rescoring); `infra/aws` (evidence + app stacks).
- Contract draft in `docs/api/contract-v0-proposal.md` is **pending team confirmation**. The web client imports `@astig/contracts`. `GET /issues` (web gaps G1–G5) and `GET /analytics/summary` are now live, so the web app can drop its local list types. G6 (the recommendation band) is still open.
- **AWS (2026-10-04):** owner's account, `ap-southeast-1`. Root has MFA, the budget alert is **$40/month**, the Identity Center admin user is used instead of root, and the local CLI profile is `astig` (SSO). Deployed: `CDKToolkit`, `Astig-dev-Evidence` (private bucket), `Astig-dev-App` (isolated VPC with no NAT, private RDS PostgreSQL 17 `db.t4g.micro`, Cognito, HTTP API with JWT, 4 Lambdas, S3→ingest trigger). Running cost is about $1.05/day. The live smoke test passed (see `infra/aws/README.md`). API URL and Cognito IDs are in `infra/aws/README.md`. Teardown steps are in the same README.
- Initial branch was clean at scaffold start.

## Team

Four-person team. The user is primarily focused on backend/API and database work and will help across integration. Add teammate names/owners at kickoff.

| Role | Owner | Current focus |
| --- | --- | --- |
| Backend/API + database + AWS | You | PostGIS model/migrations, API contracts, learn/operate AWS deployment path; support integration |
| Mobile + web client | Pending | One teammate owns Android React Native client and React + Vite dashboard |
| Requirements/QA/demo support | Pending | Trace hackathon requirements, test acceptance paths, support approved demo assets and rehearsal |
| Integration/analytics support | Pending | Smoke tests, Quick/Quick Sight feasibility, judging/demo needs, discrete assigned tasks |

Name one integration/demo coordinator at kickoff; one teammate owns both client apps, while the remaining teammates support requirements, QA, analytics, and integration. Keep interfaces shared and integration checkpoints frequent.

## Decisions to resolve first

See [architecture decisions](../docs/architecture/decisions.md) and the [pre-build setup checklist](../docs/operations/prebuild-setup.md). Prioritize Expo/native VIO feasibility, local PostGIS setup, auth/demo mode, AWS account/region/topology, map provider, and a truthful fallback if external inference fails.

## Immediate next actions

1. Confirm the three teammate owners and name an integrator/demo lead.
2. Complete the setup readiness gate in `docs/operations/prebuild-setup.md`.
3. Verify Android device install and local Docker PostGIS access.
4. Agree API/database contracts before splitting implementation.
5. Start from the appropriate prompt in `docs/operations/role-prompts.md`.

## Session log

| Date | Changes / validation | Next step / blocker |
| --- | --- | --- |
| 2026-10-03 | Initial product/architecture analysis, stack interview, setup checklist, and role prompt pack. No application code or tests exist yet. | Team kickoff: assign owners, confirm recommended tooling, complete readiness gate, agree API/data contracts. |
| 2026-10-03 (client) | Created npm workspace root (`package.json`, lists `apps/web` only; add other packages when they have a `package.json`). Built web slice against mock API + synthetic data; typecheck, 17 tests, and build pass. See `apps/web/README.md` for provisional contract fields. | Backend owner to confirm/replace provisional fields. Mobile not started: needs Android device + `adb` (not installed) and VIO/Expo decision. |
| 2026-10-03 (backend) | Backend slice: contract v0 proposal, migration 0001 + synthetic seed, risk score, issue-detail/work-order API, CDK evidence bucket. Ran on Node 24.12.0: `npm run typecheck` OK; `npm test` 68/68; `npm run test:db` 45/45; migrate/seed/reset scripts; local HTTP smoke test; `cdk synth` with placeholder account. Vitest 5 does not support Node 25, so use Node 24 (`.nvmrc`). | Team confirms contract gaps; integration owner agrees upload-URL/worker interfaces (reuse `@astig/database`); account owner sets budget/roles; read-only `sts get-caller-identity` check before any deploy. Next API work: sessions, observation route, `GET /issues` list. |
| 2026-10-03 (merge) | Merged client and backend work: root `package.json` workspaces now include `apps/web` plus backend packages; lockfile regenerated. Client contract proposal (`docs/api/client-contract-proposal.md`) and backend proposal (`docs/api/contract-v0-proposal.md`) both exist and must be reconciled into one contract. | Backend + client owners reconcile field names; web switches from provisional `apps/web/src/api/types.ts` to `@astig/contracts`. |
