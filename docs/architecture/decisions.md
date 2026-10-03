# Architecture decisions and kickoff questions

## Decisions already established by the product spec

| Topic | Direction | Rationale |
| --- | --- | --- |
| Product | ASTIG: Automated Street & Infrastructure Geospatial Intelligence | Focused vehicle-based infrastructure observation and response |
| Mobile client | React Native for Android; recommend Expo development build (not Expo Go if native camera/VIO modules are needed) | Reuse React/TypeScript skills while retaining native Android device access |
| Web client | React + Vite + TypeScript | Fast SPA setup for a map-centric operational dashboard without server-rendering needs |
| Web design system | CSS custom properties/design tokens, CSS Modules, and accessible headless primitives | Lets the separate UI designer substantially change visual direction without rewriting application behavior |
| API and worker language | TypeScript on Node.js, matching the React clients; share runtime-validated contracts | One language/tooling ecosystem reduces context switching and AI-generated integration mismatches for this team |
| Monorepo | Recommend npm workspaces | Uses the Node/npm toolchain already required for React/TypeScript; avoid adding a task orchestrator until needed |
| Runtime validation | Recommend Zod schemas in shared contracts | Reuse request/model-output validation and inferred TS types |
| PostGIS access | Recommend ordered SQL migrations and `pg` driver for MVP | Direct, predictable control of PostGIS types and spatial SQL; avoid ORM limitations during the prototype |
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
| Web language/build tool | React + Vite + TypeScript selected for the operational SPA. | Recorded from team preference / first 30 minutes |
| Mobile implementation | Android-only React Native. Expo development build is the recommended starting point; verify native VIO/camera library support before locking Expo vs bare. Do not rely on Expo Go for custom native modules. | Recorded from team preference / first 30 minutes |
| Backend/worker language | TypeScript on Node.js is selected for API and worker. Prefer shared runtime schemas; use explicit SQL migrations and Postgres/PostGIS queries. | Recorded from team preference / first 30 minutes |
| Local database | Docker Postgres + PostGIS for local development; managed RDS only for deployed demo | Backend owner / first hour |
| AWS topology | S3 → Lambda initially; add SQS for retries/burst control if time allows | Backend/infrastructure owner |
| Infrastructure as code | AWS CDK in TypeScript is recommended to match the app/worker language; bootstrap only the agreed dev account/region | Infra owner |
| Authentication | Minimal managed/demo auth with clear boundaries; do not hardcode production credentials | Team |
| Map provider | Select based on access, cost, and current team familiarity | Web owner |
| Vision provider | Verify Gemini access/quotas; keep adapter and strict schema so provider can change | AI/backend owner |
| Demo imagery | Do not use Google Street View for the hackathon MVP by default. Use team-captured, synthetic, or explicitly licensed local sample images; mark demo data. Reconsider Street View only if there is a clear need, approved budget/credits, and terms review. | Team |
| Weather/hazard source | Use only if data is accessible and attribution/freshness are clear | Stretch |
| Analytics integration | Confirm Quick availability and decide direct dataset/export path | Integrator |
| Demo mode | Real capture vs synthetic seed vs both; mark generated data visibly | Team / first hour |

Record each final choice with date, owner, and consequence below. Do not silently present an open choice as settled.

## Decision log

| Date | Decision | Owner | Consequence |
| --- | --- | --- | --- |
| 2026-10-03 | Android-only React Native for mobile; React + Vite + TypeScript for web; use CSS tokens/modules and headless primitives for a replaceable visual system. Expo development build is the mobile default pending native-library validation. | Product/backend lead | Confirm Expo support for selected camera/VIO modules; do not assume Expo Go is sufficient. Keep visual styling separate from application behavior. |
| 2026-10-03 | TypeScript on Node.js selected for the API and worker, aligned with the React clients; choose shared runtime validation and keep PostGIS work in explicit SQL migrations/queries. | Product/backend lead | A common language reduces integration overhead; no ORM or API framework is mandated yet. |
| 2026-10-03 | Defer Google Street View for the hackathon MVP; it is not required for the demo. | Team | Avoid API billing, key setup, attribution/UI constraints, and caching/storage restrictions. Use team-captured, synthetic, or explicitly licensed local imagery and clearly label it. |
| 2026-10-03 | Recommend npm workspaces, Zod shared runtime schemas, PostgreSQL/PostGIS via ordered SQL migrations and `pg`, Docker PostGIS locally, and AWS CDK in TypeScript. | Backend/infrastructure owners | Confirm these defaults at kickoff; postpone an ORM/task orchestrator until a concrete need appears. |
