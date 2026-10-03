# ASTIG end-to-end demo runbook

## Demo story

“A vehicle that is already traveling the city captures evidence of a blocked drain. ASTIG makes that evidence visible and actionable, while an officer remains in control.”

## Happy path

1. Start an inspection session, or replay the curated Manila dashcam route through the API (see [dashcam demo data](dashcam-demo-data.md)); fall back to the clearly labeled synthetic seed.
2. Show capture time, location, and image evidence.
3. Show the structured detection: issue type, blockage estimate if applicable, confidence, and review flag.
4. Open the issue marker on the map and inspect its history.
5. Explain the weighted score and distinguish known inputs from unavailable context.
6. As an officer, create a work order and assign the responsible team/department.
7. Move the work order `OPEN → IN_PROGRESS → RESOLVED`; optionally attach resolution evidence.
8. Show updated Quick/Quick Sight or summary metrics. Before showing them, invoke the analytics export (or wait up to 15 minutes), then click **Refresh now** on the QuickSight datasets `ASTIG issues` and `ASTIG sessions`.

## Pre-demo checks

- [ ] Dashcam footage rights confirmed in writing (team-recorded, or licensed for this use); faces and plates blurred and frames second-checked.
- [ ] Say it out loud: "real Manila footage replayed through ASTIG; capture timing simulated; locations from dashcam GPS / hand-traced; AI results live / pre-labeled."
- [ ] Database started at least 5 minutes before (if it was stopped overnight).
- [ ] Use a prepared route/sample image and backup synthetic records.
- [ ] Confirm app/API/database are reachable and seed state is resettable.
- [ ] Confirm inference credentials/quotas or switch to clearly labeled prerecorded result.
- [ ] Confirm map token, S3 permissions, and evidence URLs work.
- [ ] Rehearse the complete path without database edits.
- [ ] Have screenshots/video or a seeded-state fallback if network/model provider fails.
- [ ] State clearly what is live, synthetic, estimated, unavailable, and not yet validated.

## Truthful fallback behavior

If AI inference is unavailable, show an explicitly labeled prerecorded/synthetic result or a visible processing failure. Never imply a failure was a live successful model run. If a data source is missing, label that score component unknown rather than asserting no risk.
