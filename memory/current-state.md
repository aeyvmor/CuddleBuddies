# ASTIG team handoff

> Update this page at the end of each meaningful work session. Durable requirements/design live in `.kiro/specs/astig/` and `docs/`.

## Current state

- Repository contains the initial ASTIG planning/scaffold documentation.
- Team direction recorded: Android-only React Native; React + Vite + TypeScript web; TypeScript/Node API + worker.
- Recommended defaults documented: Expo development build (verify native VIO support), npm workspaces, Zod shared schemas, SQL migrations + `pg`, Docker PostGIS locally, and AWS CDK in TypeScript.
- User owns backend and AWS tasks, is new to AWS, and will work from an iPad; setup docs guide browser-based Console/CloudShell access without local AWS installation or long-lived keys.
- Street View is deferred for the MVP to avoid per-request billing and terms/setup overhead; use team-captured, synthetic, or explicitly licensed images.
- Added pre-build setup checklist and four role-specific AI coding prompts.
- **First backend slice exists (local only):** npm workspaces root; `packages/contracts` (Zod v0 draft); `packages/domain` (risk score + work-order transitions); `database` (migration 0001, synthetic seed, migrate/seed/reset scripts, Docker PostGIS on 5433); `services/api` (`GET /issues/{id}`, `POST /issues/{id}/work-orders`, `PATCH /work-orders/{id}`, auth boundary, Lambda adapter, local dev server); `infra/aws` (CDK stack with a private evidence bucket only, **not deployed**).
- Contract draft in `docs/api/contract-v0-proposal.md` is **pending team confirmation**.
- **AWS (2026-10-04):** owner's account, region `ap-southeast-1` (Singapore). Root has MFA; `astig-hackathon` budget is $10/month with email alerts. IAM Identity Center user with AdministratorAccess (8h sessions) is used instead of root; the local CLI profile is `astig` (SSO, no static keys). CDK is bootstrapped and `Astig-dev-Evidence` is deployed: private SSE-S3 bucket `astig-dev-evidence-evidencebucketfba44255-wuuvhuxdsgzy`, TLS-only, 30-day expiry, retained on stack delete. No compute, database, or network resources yet. Cleanup after the event: empty and delete the bucket, delete `Astig-dev-Evidence` and `CDKToolkit`.
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
