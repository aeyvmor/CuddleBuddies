# ASTIG project instructions

Read [`AGENTS.md`](AGENTS.md) for repository-wide engineering rules. Read the relevant `.kiro/specs/astig/` documents and `docs/` contracts before changing product behavior.

Keep implementation aligned with the MVP: distance-sampled capture → asynchronous validated vision extraction → PostGIS-backed issues → explainable 0–100 priority → officer-approved work order. Do not implement roadmap items (full flood simulation, autonomous dispatch, citizen app, or workforce routing) without an explicit team decision.

Before parallelizing implementation, agree the API and data contracts. Preserve idempotency, failure visibility, human review, privacy boundaries, and versioned schemas.
