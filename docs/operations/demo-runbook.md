# ASTIG end-to-end demo runbook

## Demo story

“A vehicle that is already traveling the city captures evidence of a blocked drain. ASTIG makes that evidence visible and actionable, while an officer remains in control.”

## Happy path

1. Start an inspection session or load a clearly labeled synthetic route.
2. Show capture time, location, and image evidence.
3. Show the structured detection: issue type, blockage estimate if applicable, confidence, and review flag.
4. Open the issue marker on the map and inspect its history.
5. Explain the weighted score and distinguish known inputs from unavailable context.
6. As an officer, create a work order and assign the responsible team/department.
7. Move the work order `OPEN → IN_PROGRESS → RESOLVED`; optionally attach resolution evidence.
8. Show updated Quick/Quick Sight or summary metrics.

## Pre-demo checks

- [ ] Use a prepared route/sample image and backup synthetic records.
- [ ] Confirm app/API/database are reachable and seed state is resettable.
- [ ] Confirm inference credentials/quotas or switch to clearly labeled prerecorded result.
- [ ] Confirm map token, S3 permissions, and evidence URLs work.
- [ ] Rehearse the complete path without database edits.
- [ ] Have screenshots/video or a seeded-state fallback if network/model provider fails.
- [ ] State clearly what is live, synthetic, estimated, unavailable, and not yet validated.

## Truthful fallback behavior

If AI inference is unavailable, show an explicitly labeled prerecorded/synthetic result or a visible processing failure. Never imply a failure was a live successful model run. If a data source is missing, label that score component unknown rather than asserting no risk.
