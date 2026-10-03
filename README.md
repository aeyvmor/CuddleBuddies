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
| `database/` | Postgres/PostGIS migrations, seeds, and local database support |
| `infra/aws/` | AWS deployment and environment configuration |
| `docs/` | Product, architecture, API, data, privacy, and demo references |
| `.kiro/` | Kiro requirements, design, implementation tasks, and steering |
| `memory/` | Short handoff notes for continuity between working sessions |

The directory layout is intentionally language-neutral until the team confirms mobile and backend language choices. See [the kickoff and architecture decisions](docs/architecture/decisions.md) before adding frameworks or dependencies.

## Start here

1. Read [the product and architecture rundown](docs/architecture/system-overview.md).
2. Review [the MVP requirements and out-of-scope list](.kiro/specs/astig/requirements.md).
3. Resolve the decisions marked **OPEN** in [architecture decisions](docs/architecture/decisions.md).
4. Agree on API and data contracts before parallel implementation.
5. Track current ownership and blockers in [team handoff](memory/current-state.md).

## Local setup

This repository currently contains planning and structure only; application runtimes and dependencies have not yet been selected or installed. Once the team locks those choices, add the root development commands and per-app setup instructions here.

Never commit credentials. Keep local secrets in ignored `.env` files and document required variable names in `.env.example` files without real values.

## Hackathon success criterion

Demonstrate one complete, repeatable story: a captured or seeded observation appears on the map with evidence and an explainable score; an officer reviews it, creates a work order, advances it through `OPEN → IN_PROGRESS → RESOLVED`, and can see the result in summary analytics.
