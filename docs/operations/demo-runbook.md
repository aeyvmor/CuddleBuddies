# ASTIG end-to-end demo runbook

## Demo story

"A vehicle that's already driving through the city records the street. ASTIG turns that footage into geolocated evidence of a blocked drain, explains why it matters, and lets an officer act on it, with the officer always in control."

## What's loaded (2026-10-04)

| Data | Source | Label in the UI |
| --- | --- | --- |
| **BLOCKED_DRAIN, Manila** (Claveria St, Binondo): 2 observations, 40–75% blockage, score 13.75 of 55 measurable points | Real TFH TV dashcam footage (friend's channel, used with written permission), replayed through the live pipeline; **Gemini result is live** | `isSynthetic` (demo replay), sampling "Dashcam replay", ±30 m |
| 32 other Binondo + C5/Katipunan frames | Same footage; Gemini found no issue | `COMPLETED` in the processing counts |
| 3 seeded issues in "Demo Area A (synthetic)" (one open work order, one resolved) | Synthetic seed | Demo badge, `SYNTHETIC:` text |

## Happy path (about 4 minutes)

1. **Map:** open `https://astig-xi.vercel.app` and sign in as `demo-officer`. Point out the demo-data badge.
2. **Issue:** open the **Manila blocked drain**. Show:
   - both dashcam images (blurred);
   - capture time and the "Dashcam replay" sampling method;
   - the location with its ±30 m uncertainty.
3. **AI evidence:** show Gemini's description, blockage %, confidence, and the "requires human review" flag. Say: *"The AI is advisory. It extracts evidence; it doesn't decide anything."*
4. **Score:** severity and recurrence are measured; weather, hazard, and exposure are **unknown, not zero**. That's why the score is 13.75 out of a possible 55 from measured inputs. Say: *"It's an explainable prioritization aid, not a flood prediction."*
5. **Officer action:** create a work order, assigned to e.g. "Manila Drainage Maintenance (demo)". This is the human approval step.
6. **Lifecycle:** move it OPEN → IN_PROGRESS → RESOLVED. Optionally attach an after photo.
7. **Analytics:** show the summary in the web app. For QuickSight:
   - invoke the analytics export (`AnalyticsExportFunctionName`) or wait up to 15 minutes;
   - in QuickSight, open Datasets → **ASTIG issues** → **Refresh now** (same for **ASTIG sessions**);
   - show the `ASTIG Operations` dashboard.
8. **Pipeline (optional, for technical judges):** show CloudWatch logs or the architecture: S3 → Ingest → Gemini → Persist → PostGIS, failures recorded explicitly, idempotent retries.

## What to say about what's real

"This is real Manila street footage from our friend's channel, used with permission, replayed through ASTIG as if a phone had captured it. The positions are hand-traced on OpenStreetMap and the timing is simulated, because the dashcam had no GPS. Faces and licence plates are blurred. The AI results are live Gemini output, advisory only. The other issues are clearly labelled synthetic seed data. The risk weights are demonstration assumptions, not validated coefficients."

## Before the demo (T-30 min)

- [ ] **Database running.** If it was stopped: `aws rds start-db-instance --db-instance-identifier astig-dev-app-databaseb269d8bb-gxsgnxmjqp0q --profile astig`, then wait about 5 minutes.
- [ ] **Clean state:** admin Lambda `{"action":"reset-demo","scope":"WORK_ORDERS","confirm":"RESET_DEMO_DATA"}`. This restores the seed work orders and reopens issues; it keeps the dashcam results. Then run the analytics export and refresh QuickSight.
- [ ] Sign in as `demo-officer` on the Vercel URL. The map shows 4 issues, and opening the Manila drain shows its images.
- [ ] `aws sso login --profile astig` (8-hour session) on the laptop that will run the admin commands.
- [ ] Rehearse the whole path once without touching the database; then reset again.
- [ ] Screenshots of each step saved locally as a fallback.

## Fallbacks (say what failed; never fake success)

| Failure | Do this |
| --- | --- |
| Venue Wi-Fi down | Use a phone hotspot. If that fails too, use the screenshots and say "recorded earlier today" |
| Vercel site down | Run the web app locally (`npm run web:dev`, which uses `localhost:5173`, also allowed by CORS) |
| Gemini error | Already-processed results stay. New uploads show `FAILED` with the reason; show that as the error handling working |
| QuickSight access issue | Show `GET /analytics/summary` in the web app: same numbers, same SQL views |
| Login problem | Reset the user's password (`aws cognito-idp admin-set-user-password … --permanent`) |

## After the event

- Delete the raw unblurred frames: `tools/dashcam-replay/work/*/frames/`, plus the original videos if they're no longer needed.
- Rotate or delete the Gemini key. Delete the demo Cognito users.
- Teardown: see `infra/aws/README.md`. Cancel QuickSight.
