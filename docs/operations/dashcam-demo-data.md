# Demo data from Manila dashcam footage

Status: **implemented and verified end to end on AWS (2026-10-04)** with a synthetic test video. Waiting for the team's footage and the Gemini key.

Decisions (2026-10-04):
- The footage is **team-recorded**.
- The dashcam has **no GPS**, so the route is hand-traced.
- The vision provider is **Gemini**.
- `DASHCAM_REPLAY` is approved as a sampling method.
- **Area names** are on (NCR city boundaries).

## How it works

Curated, redacted frames go through the **same API, S3 upload, worker, Gemini call, validation, issue matching, scoring, and work-order path** as a live phone capture. Only the capture device is simulated: the replay tool (`tools/dashcam-replay`) stands in for the phone.

```text
team dashcam video ─► trace route + anchors ─► plan (frame every 7 m) ─► extract (ffmpeg)
  ─► redact + curate (blur faces/plates, drop bad frames, 2nd-person check)
  ─► replay as OPERATOR: POST /sessions → POST /sessions/{id}/observations → POST /upload-url → PUT S3
  ─► worker: Gemini → schema validation → issue (25 m, same type) + NCR city name → risk.v0 score
  ─► officer: web map/detail → work order → resolved → analytics export → QuickSight
```

## Runbook

1. **Gemini key (one time).** In the AWS console (Singapore), open **Secrets Manager**, select the secret `VisionProviderApiKey…` (stack output `VisionSecretName`), choose **Retrieve secret value** → **Edit** → **Plaintext**, paste only the key, and save. The worker picks it up within 5 minutes. Never put the key in code, `.env.example`, chat, or a screenshot.
2. **Operator login (one time).** Create a Cognito user in the `OPERATOR` group (commands in `infra/aws/README.md`). Put the credentials in your git-ignored `.env`, together with `ASTIG_REPLAY_DEVICE_ID=cd9706b5-cf1b-45e3-ba7c-c78ebc211d5d` and `ASTIG_REPLAY_VEHICLE_ID=4f031f08-be00-491d-a249-72f53d3e6e19`. These are registered as `Dashcam replay rig (demo)` and `Dashcam replay vehicle (demo)`, both `isSynthetic: true`.
3. **Footage.** Copy the video into `demo-footage/` (git-ignored). Write a route file (see `tools/dashcam-replay/README.md`).
4. **Plan and extract:** `npm run dashcam -- plan --route <file>`, then `npm run dashcam -- extract --work <dir>`.
5. **Redact and curate.**
   - Blur every face and licence plate (any blur tool, e.g. `deface` for faces plus manual boxes for plates). Keep the same file names.
   - Delete frames that are unusable or can't be cleaned well; 20–60 good frames are enough.
   - Save the results to `<work>/redacted/`.
   - A second person checks every frame before upload.
6. **Replay:** `npm run dashcam -- replay --work <dir>`. Re-run it if anything fails; it's idempotent.
7. **Check:** issues appear on the map with their city name; `FAILED` frames show their reason. Invoke the analytics export, then refresh QuickSight.
8. **After the event:** delete local frames and video. Uploaded evidence expires from S3 after 30 days, and teardown deletes it earlier.

## Truthful labeling

- Each frame's sampling method shows as "Dashcam replay (recorded footage)", never GPS or VIO.
- Every replayed row is `isSynthetic = true`, so demo badges and `includesSynthetic` apply.
- Locations are hand-traced, with stated uncertainty (`horizontalAccuracyM`), and the issue's `locationUncertaintyM` inherits it. Area names come from OpenStreetMap city boundaries (ODbL); they are not authoritative legal boundaries.
- Gemini output is real model output on real frames (`modelVersion: gemini:<model>`). It's advisory. Officers decide.
- If Gemini is unavailable, frames show `FAILED` with the reason. They're never shown as detections.
- Script line: "Real Manila street footage our team recorded, replayed through ASTIG. Capture timing is simulated and locations are hand-traced."

## Verified (2026-10-04, synthetic test pattern, not footage)

- **Local:** `plan` produced 31 frames every 7 m over 210 m. `extract` wrote 31 JPEGs at 1280×720 with no metadata.
- **Live replay of 3 frames:** 3 registered and uploaded, and the worker marked all 3 `FAILED: PROVIDER_NOT_CONFIGURED` (correct while the secret holds the placeholder).
- **Re-run:** 0 new records, 3 already registered, 3 already uploaded.
- **Database:** migration `0003` applied and 17 NCR areas loaded.
