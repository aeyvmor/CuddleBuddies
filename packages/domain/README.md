# Shared domain logic

Unit-testable rules with no framework or provider dependencies.

- `risk-score.ts`: `computeRiskScore(inputs, config = RISK_V0_CONFIG)`. Each factor's normalized input is 0–100; `weightedPoints = min(value × weight, cap)`; total is 0–100. Caps must sum to ≤ 100. `UNKNOWN` inputs contribute no points and are reported through `knownCapTotal`, so unknown is never presented as zero risk. Out-of-range input throws instead of being clamped. Normalizers: severity (`NONE 0 … CRITICAL 100`) and recurrence (`(count − 1) × 25`, capped at 100).
- `work-order.ts`: `decideWorkOrderTransition(from, to)` allows `OPEN → IN_PROGRESS → RESOLVED`; same-status is a no-op; `RESOLVED` is terminal.
- `evidence.ts`: `evidenceObjectKey(sessionId, clientObservationId)`, the single source of session-scoped S3 keys.

Prototype weights (35/25/20/10/10) are demonstration assumptions, not calibrated flood-risk coefficients. Changing them requires a new `formulaVersion`.
