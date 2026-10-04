# ASTIG team handoff

> Update this page at the end of each meaningful work session. Durable requirements/design live in `.kiro/specs/astig/` and `docs/`.

## Current state (2026-10-04 ~08:45, before the 9:00 demo)

**Working end to end, live:** Android phone (Expo) or the dashcam replay captures → presigned S3 upload → Gemini (`gemini-3.1-flash-lite`, structured JSON + AI-estimated boxes) → PostGIS issue with NCR city name and `risk.v0` score → web dashboard (`https://astig-xi.vercel.app`, Cognito sign-in, OpenStreetMap map, red boxes) → officer work order with field reports and photos → analytics export → QuickSight dashboard `ASTIG Operations`.

| Area | State |
| --- | --- |
| AWS (`ap-southeast-1`, owner's account, CLI profile `astig` via SSO) | `CDKToolkit`, `Astig-dev-Evidence` (private bucket), `Astig-dev-App`: isolated VPC with no NAT, private RDS PostgreSQL 17 `db.t4g.micro` (migrations 0001–0005), Cognito, HTTP API + JWT, 6 Lambdas, S3 triggers, analytics bucket + 15-min export, 8 alarms → SNS. About $1.05/day plus QuickSight $24/month. Budget alert $60. Details: `infra/aws/README.md` |
| Backend | Sessions, observations, upload URL, issue list/detail, work orders, resolution evidence, analytics, admin Lambda (`migrate`, `seed`, `status`, `register-*`, `load-ncr-cities`, `reset-demo`). Contract: `docs/api/contract-v0-proposal.md` |
| Web (`apps/web`) | Live by default (`VITE_ASTIG_API=mock` for offline). AuthGate sign-in, Leaflet + OSM map, AI region overlays, field-report dialog for start/complete work, after photos, analytics panel |
| Mobile (`apps/mobile`, separate Expo project) | Connected: sign-in, secure tokens, session → observation → upload. First real captures processed (Taguig). VIO stays a no-go; captures are `MANUAL` / `GPS_DISTANCE` |
| Demo data | Synthetic seed (3 issues, labelled placeholder images), TFH TV dashcam replay (Manila drain + 2 Katipunan standing-water issues; blurred; written permission), 2 live phone issues (Taguig). Runbook: `docs/operations/demo-runbook.md` |
| Accounts | `demo-officer`, `demo-operator`, `demo-admin`; passwords only in git-ignored `secrets/demo-accounts.local.md` |
| Checks at last push | Backend 144 unit / 94 database; web 69; mobile 88; all passing |

**Open items / after the event**
- **Rotate the Gemini key** (it was pasted in chat), then delete it after the event.
- Confirm the SNS alarm email subscription.
- Delete the raw unblurred frames in `tools/dashcam-replay/work/*/frames/` and, if no longer needed, the source videos. Check the Taguig phone photos before public display.
- Teardown (`infra/aws/README.md`): destroy `Astig-dev-App` and empty/delete both buckets, then `Astig-dev-Evidence` and `CDKToolkit`; cancel QuickSight; delete the demo Cognito users.
- Known limits: Lambda concurrency limit 10 (support case if throttled); Lambdas use the RDS master user; recommendation band (gap G6) not implemented; risk weights are demonstration assumptions; Gemini output varies between runs.
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
| 2026-10-04 08:45 | End-to-end live: phone and dashcam capture → Gemini (boxes) → map → work order with field-report dialog and photos → QuickSight. Docs updated for the demo. | Demo at 9:00; afterwards, run the cleanup list above. |
