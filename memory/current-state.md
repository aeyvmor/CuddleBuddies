# ASTIG team handoff

> Update this page at the end of each meaningful work session. Durable requirements/design live in `.kiro/specs/astig/` and `docs/`.

## Current state

- Repository contains the initial ASTIG planning/scaffold documentation.
- No application stack, packages, database migrations, AWS resources, or deployed services have been set up yet.
- Initial branch was clean at scaffold start.

## Team

Four-person team. The user is primarily focused on backend/API and database work and will help across integration. Add teammate names/owners at kickoff.

| Role | Owner | Current focus |
| --- | --- | --- |
| Backend/API + database | You | PostGIS model/migrations, API contracts, upload/worker path; support integration |
| Mobile capture | Pending | Session, distance sampling, GPS, offline queue |
| Web experience | Pending | Map, issue review, work-order UI |
| AI/infrastructure/integration | Pending | Vision adapter, AWS deployment, analytics, end-to-end integration |

Name one integration/demo owner at kickoff. With four people, the AI/infrastructure role may need help from the backend and web owners; keep interface contracts shared and integration checkpoints frequent.

## Decisions to resolve first

See [architecture decisions](../docs/architecture/decisions.md). Prioritize web/mobile/backend languages, local PostGIS setup, auth/demo mode, AWS topology, map provider, and how the demo will work if external inference fails.

## Immediate next actions

1. Confirm the three teammate owners and name an integrator/demo lead.
2. Lock runtime/frameworks and local commands.
3. Review MVP requirements and acceptance story.
4. Agree the API and database contracts before splitting implementation.
5. Build the smallest demonstrable capture/seed → map → work order flow.

## Session log

| Date | Changes / validation | Next step / blocker |
| --- | --- | --- |
| 2026-10-03 | Initial product/architecture analysis and repository documentation scaffold. No application code or tests exist yet. | Team kickoff: choose stack, assign owners, agree API/data contracts. |
