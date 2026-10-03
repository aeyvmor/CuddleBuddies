# Architecture decisions and kickoff questions

## Decisions already established by the product spec

| Topic | Direction | Rationale |
| --- | --- | --- |
| Product | ASTIG: Automated Street & Infrastructure Geospatial Intelligence | Focused vehicle-based infrastructure observation and response |
| MVP | Capture → detect → locate → score → human review → work order → resolve | Demonstrates operational value, not just model output |
| Capture | Distance-based sampling, prototype target about 7 m | Better route coverage consistency than timer-only capture |
| Storage | S3 for private image evidence | Keep image bytes out of transactional database/API |
| Processing | Async event-driven Lambda-style worker; Gemini is proposed for hackathon vision | Small MVP surface with provider replaceability |
| System of record | PostgreSQL + PostGIS | Relational workflow and spatial queries |
| UI | React operational dashboard/map | Supports review and work orders |
| Analytics | Amazon Quick/Quick Sight | Separate reporting/analytics from operations |
| Risk | Explainable weighted 0–100 deterministic score | Testable and auditable; not scientifically calibrated |
| Authority | Human approval before work order | AI remains advisory |

## Resolve at kickoff before parallel coding

| Decision | Options to evaluate | Owner / deadline |
| --- | --- | --- |
| Web language/build tool | React + TypeScript (recommended default unless an existing codebase dictates otherwise) | Team / first 30 minutes |
| Mobile implementation | React Native/Expo, native, or demo-assisted capture; test target devices before promising VIO | Team / first 30 minutes |
| Backend/worker language | TypeScript or Python; choose one runtime for API + worker if fastest for team | Team / first 30 minutes |
| Local database | Docker Postgres + PostGIS versus managed dev DB | Backend owner / first hour |
| AWS topology | S3 → Lambda initially; add SQS for retries/burst control if time allows | Backend/infrastructure owner |
| Infrastructure as code | CDK, SAM, Terraform, or minimal console setup for demo | Infra owner |
| Authentication | Minimal managed/demo auth with clear boundaries; do not hardcode production credentials | Team |
| Map provider | Select based on access, cost, and current team familiarity | Web owner |
| Vision provider | Verify Gemini access/quotas; keep adapter and strict schema so provider can change | AI/backend owner |
| Weather/hazard source | Use only if data is accessible and attribution/freshness are clear | Stretch |
| Analytics integration | Confirm Quick availability and decide direct dataset/export path | Integrator |
| Demo mode | Real capture vs synthetic seed vs both; mark generated data visibly | Team / first hour |

Record each final choice with date, owner, and consequence below. Do not silently present an open choice as settled.

## Decision log

| Date | Decision | Owner | Consequence |
| --- | --- | --- | --- |
| Pending | Initial team kickoff | Pending | Fill in when the four team members agree |
