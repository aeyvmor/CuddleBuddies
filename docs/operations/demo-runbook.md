# ASTIG end-to-end demo runbook

## Demo story

"A vehicle that's already driving through the city records the street. ASTIG turns that footage into geolocated evidence of a blocked drain, explains why it matters, and lets an officer act on it, with the officer always in control."

## What's loaded (2026-10-04 ~08:45, after `reset-demo ALL` + dashcam re-replay at ~07:25, phone captures at ~08:15)

| Data | Source | Label in the UI |
| --- | --- | --- |
| **BLOCKED_DRAIN, Manila** (Claveria/Poblete, Binondo): 5 observations, red **AI-estimated boxes** on the curb drain | Real TFH TV dashcam footage (friend's channel, written permission), replayed through the live pipeline; **Gemini result is live** | demo replay, "Dashcam replay", ±30 m |
| **2 × STANDING_WATER, Quezon City** (Katipunan/C5) with boxes | Same footage (C5 clip); live Gemini | positions simulated, ±100 m |
| **BLOCKED_DRAIN + DAMAGED_DRAIN, Taguig** with boxes | **Live captures from the team's Android phone** through the real mobile → API → S3 → Gemini path | real (not synthetic), "Manual" sampling, device GPS accuracy |
| 3 seeded issues in "Demo Area A (synthetic)" | Synthetic seed, labelled placeholder images | Demo badge, `SYNTHETIC` |

Gemini output varies from run to run: re-running the replay can change which frames are flagged. Boxes are **approximate, advisory** regions from a language model, not a trained detector. **The Taguig phone photos are not auto-blurred**: check them for faces or plates before showing them.

## Happy path (about 5 minutes)

1. **Capture (optional, live):** on the Android phone, sign in as `demo-operator`, start a session, take a capture of a drain or road, and end the session. About 5–10 s later it appears on the web map with Gemini's result and boxes.
2. **Map:** open `https://astig-xi.vercel.app` and sign in as `demo-officer`. Point out the demo-data badge and the OpenStreetMap basemap with uncertainty circles.
3. **Issue:** open the **Manila blocked drain**. Show the red AI-estimated boxes on the drain, and:
   - the dashcam images (blurred);
   - capture time and the "Dashcam replay" sampling method;
   - the location with its ±30 m uncertainty.
4. **AI evidence:** show Gemini's description, blockage %, confidence, and the "requires human review" flag. Say: *"The AI is advisory. It extracts evidence; it doesn't decide anything."*
5. **Score:** severity and recurrence are measured; weather, hazard, and exposure are **unknown, not zero**. That's why the score is low out of the 55 points measurable from known inputs. Say: *"It's an explainable prioritization aid, not a flood prediction."*
6. **Officer action:** create a work order, assigned to e.g. "Manila Drainage Maintenance (demo)". This is the human approval step.
7. **Field work:**
   - **Mark In progress** opens the **field inspection** window: crew on site, findings, "inspected in person" confirmation, and optional site photos. Confirm.
   - **Mark Resolved** opens the **close-out report**: work done, "repair verified", and optional after photos. Confirm.
   - Show the timestamped notes and photos on the work order.
8. **Analytics:** show the summary in the web app. For QuickSight:
   - invoke the analytics export (`AnalyticsExportFunctionName`) or wait up to 15 minutes;
   - in QuickSight, open Datasets → **ASTIG issues** → **Refresh now** (same for **ASTIG sessions**);
   - show the `ASTIG Operations` dashboard.
9. **Pipeline (optional, for technical judges):** show CloudWatch logs or the architecture: S3 → Ingest → Gemini → Persist → PostGIS, failures recorded explicitly, idempotent retries.

## What to say about what's real

"This is real Manila street footage from our friend's channel, used with permission, replayed through ASTIG as if a phone had captured it. The positions are hand-traced on OpenStreetMap and the timing is simulated, because the dashcam had no GPS. Faces and licence plates are blurred. The Taguig issues come from our own phone, captured live through the app. The AI results are live Gemini output, advisory only, and the red boxes are AI-estimated areas, not a trained detector. The other issues are clearly labelled synthetic seed data. The risk weights are demonstration assumptions, not validated coefficients."

## Before the demo (T-30 min)

- [ ] **Database running.** If it was stopped: `aws rds start-db-instance --db-instance-identifier astig-dev-app-databaseb269d8bb-gxsgnxmjqp0q --profile astig`, then wait about 5 minutes.
- [ ] **Clean state:** admin Lambda `{"action":"reset-demo","scope":"WORK_ORDERS","confirm":"RESET_DEMO_DATA"}`. This restores the seed work orders and reopens issues; it keeps the dashcam results. Then run the analytics export and refresh QuickSight.
- [ ] Sign in as `demo-officer` on the Vercel URL. The map shows 8 issues (Manila, Quezon City, Taguig, and the synthetic Demo Area A), and opening the Manila drain shows its images with red boxes.
- [ ] Taguig phone photos checked for faces or plates (skip that issue if any are visible).
- [ ] Phone signed in as `demo-operator` with location and camera permission granted.
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
