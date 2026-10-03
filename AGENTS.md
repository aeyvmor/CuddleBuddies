# Repository guidance for coding agents

## Product constraints

- Build ASTIG's hackathon vertical slice, not the future roadmap.
- Treat AI as evidence extraction only. Risk scoring is deterministic and explainable; a person approves operational action.
- Do not claim the MVP predicts flooding or performs hydrological simulation.
- Keep images out of the API request path where possible: use short-lived presigned S3 uploads and asynchronous processing.
- Preserve observation evidence and processing failures; never turn failed inference into a successful detection.
- Keep public map fields separate from restricted image evidence and personal data.

## Engineering rules

- Read the applicable requirements, design, and API/data contract before implementing a feature.
- Agree on shared contracts before parallel work across mobile, API, worker, and web.
- Put business rules in testable domain modules rather than UI handlers or cloud-provider glue.
- Persist schema changes as ordered, reviewed database migrations. Enable PostGIS and use spatial indexes for spatial queries.
- Make ingestion and processing idempotent. Validate all external inputs, including model output, before persistence.
- Use UTC timestamps, explicit units, stable identifiers, and versioned schemas.
- Keep errors visible and actionable. Do not swallow exceptions or use success-shaped fallbacks.
- Add focused tests for acceptance criteria and risk-scoring edge cases.
- Do not add dependencies, infrastructure, or abstractions without a concrete MVP need.
- Never commit secrets, private imagery, or real personal data. Use synthetic/demo data.

## Workflow

- Check the worktree before editing and preserve unrelated user changes.
- Make the smallest complete change; run the narrowest relevant validation and report its result.
- Update directly related documentation when API, schema, or workflow behavior changes.
- Track current decisions, ownership, blockers, and next steps in `memory/current-state.md`.
- Keep durable product truth in `.kiro/` and `docs/`; session memory is a concise handoff, not a second specification.

## Before merging

- Confirm acceptance criteria are met and migrations are reproducible.
- Confirm no credentials or real captured images were added.
- Confirm failure paths, privacy implications, and API/schema compatibility were considered.
- Report changed areas, checks run, known limitations, and follow-up work.
