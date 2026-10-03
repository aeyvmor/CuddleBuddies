# ASTIG team handoff

> Update this page at the end of each meaningful work session. Durable requirements/design live in `.kiro/specs/astig/` and `docs/`.

## Current state

- Repository contains the initial ASTIG planning/scaffold documentation.
- Team direction recorded: Android-only React Native; React + Vite + TypeScript web; TypeScript/Node API + worker.
- Recommended defaults documented: Expo development build (verify native VIO support), npm workspaces, Zod shared schemas, SQL migrations + `pg`, Docker PostGIS locally, and AWS CDK in TypeScript.
- User owns backend and AWS tasks, is new to AWS, and will work from an iPad; setup docs guide browser-based Console/CloudShell access without local AWS installation or long-lived keys.
- Street View is deferred for the MVP to avoid per-request billing and terms/setup overhead; use team-captured, synthetic, or explicitly licensed images.
- Added pre-build setup checklist and four role-specific AI coding prompts.
- No application dependencies, database migrations, AWS resources, or deployed services have been set up yet.
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
