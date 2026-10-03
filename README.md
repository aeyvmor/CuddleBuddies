# ASTIG

**Automated Street & Infrastructure Geospatial Intelligence**

ASTIG turns routine vehicle trips into geolocated street-infrastructure observations. The hackathon MVP captures sampled street images, extracts structured evidence with vision AI, maps and prioritizes issues, and lets an authorized officer create and track a work order.

## MVP loop

**Capture → Detect → Locate → Prioritize → Human review → Work order → Resolve**

AI findings are advisory. ASTIG does not claim to predict floods or autonomously dispatch government teams.

## Repository map

| Path | Responsibility |
| --- | --- |
| `apps/mobile/` | Vehicle-mounted capture, GPS, distance-based sampling, and offline queue |
| `apps/web/` | Operational map, issue review, work orders, and demo experience |
| `services/api/` | Authenticated API and upload/session/work-order operations |
| `services/worker/` | Asynchronous image validation, AI inference, and observation processing |
| `packages/contracts/` | Shared request, response, and AI-output schemas |
| `packages/domain/` | Testable risk-scoring and issue-domain rules |
| `packages/design-tokens/` | Cross-platform semantic design tokens for a replaceable visual system |
| `database/` | Postgres/PostGIS migrations, seeds, and local database support |
| `infra/aws/` | AWS deployment and environment configuration |
| `docs/` | Product, architecture, API, data, privacy, and demo references |
| `.kiro/` | Kiro requirements, design, implementation tasks, and steering |
| `memory/` | Short handoff notes for continuity between working sessions |

The directory layout reserves clear app/service boundaries while the team finalizes dependencies and native-module requirements. See [the kickoff and architecture decisions](docs/architecture/decisions.md) before adding frameworks or dependencies.

## Start here

1. Read [the product and architecture rundown](docs/architecture/system-overview.md).
2. Review [the MVP requirements and out-of-scope list](.kiro/specs/astig/requirements.md).
3. Review the selected stack and recommendations in [architecture decisions](docs/architecture/decisions.md).
4. Agree on API and data contracts before parallel implementation.
5. Track current ownership and blockers in [team handoff](memory/current-state.md).

Before installing dependencies or creating app code, follow the [team setup checklist](docs/operations/prebuild-setup.md) and use the [role-specific starter prompts](docs/operations/role-prompts.md).

## Local setup

The backend slice runs locally (Node 24 LTS per `.nvmrc`, Docker Desktop):

```text
copy .env.example .env
npm install
npm run db:up && npm run db:reset    # PostGIS + synthetic seed
npm test && npm run test:db          # unit + database integration tests
npm run api:dev                      # local API on 127.0.0.1:3001
```

See `database/README.md`, `services/api/README.md`, and `infra/aws/README.md`. The mobile, web, and worker apps are not scaffolded yet; follow the [pre-build setup checklist](docs/operations/prebuild-setup.md) for them.

Never commit credentials. Keep local secrets in ignored `.env` files and document required variable names in `.env.example` files without real values.

## Hackathon success criterion

Demonstrate one complete, repeatable story: a captured or seeded observation appears on the map with evidence and an explainable score; an officer reviews it, creates a work order, advances it through `OPEN → IN_PROGRESS → RESOLVED`, and can see the result in summary analytics.
