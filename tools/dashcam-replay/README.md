# Dashcam replay (demo data tool)

Turns team-recorded Manila dashcam footage into ASTIG observations by **replaying curated, redacted frames through the real API**: session → observation → presigned upload → S3 → worker → Gemini → issue → score. Only the capture device is simulated. Every replayed observation uses `samplingMethod: "DASHCAM_REPLAY"`, is linked to a device registered as demo (`isSynthetic: true`), and carries the stated hand-tracing uncertainty as `horizontalAccuracyM`.

Plan and privacy rules: [`docs/operations/dashcam-demo-data.md`](../../docs/operations/dashcam-demo-data.md).

## Commands (repo root, Node 24)

```text
npm run dashcam -- plan    --route <route.json> [--interval 7]   # distance-sample the traced route → work/<name>/plan.json
npm run dashcam -- extract --work tools/dashcam-replay/work/<name>   # ffmpeg one JPEG per planned point → work/<name>/frames/ (UNREDACTED)
#   → blur faces/plates, delete bad frames, save to work/<name>/redacted/ with the same file names; second person checks
npm run dashcam -- replay  --work tools/dashcam-replay/work/<name>   # uploads ONLY redacted/ frames through the API
```

- `extract` needs ffmpeg. Set `FFMPEG_PATH` if it isn't on `PATH`.
- `replay` reads these settings from the git-ignored `.env`:
  - `ASTIG_API_URL`
  - `ASTIG_COGNITO_CLIENT_ID`
  - `ASTIG_OPERATOR_USERNAME` and `ASTIG_OPERATOR_PASSWORD` (a Cognito user in the `OPERATOR` group)
  - `ASTIG_REPLAY_DEVICE_ID` and `ASTIG_REPLAY_VEHICLE_ID`, from the admin Lambda `register-device` / `register-vehicle` actions with `"isSynthetic": true`
- All ids are deterministic (UUIDv5 from the video hash, route, and frame index). Re-running `replay` after a failure never duplicates anything.
- `work/`, videos, and `.gpx` files are git-ignored. Never commit footage or frames.

## Route file (no dashcam GPS)

See `examples/route.example.json`.

1. Trace the driven roads in [geojson.io](https://geojson.io) as a LineString, then copy its coordinates (`[lon, lat]`) into `route`.
2. Add **anchors**: at video second `videoSec` the car was at route vertex `routeIndex`. Read them from landmarks you can see in both the video and the map (intersections, footbridges, signs). Use at least the start and end, plus one at every long stop such as a traffic light. Between anchors the car is assumed to move at constant speed. `plan` warns if a segment implies an implausible speed.
3. Set `recordedStartUtc` (the dashcam clock converted to UTC) and `locationAccuracyM` (how far off the traced position could be; 15–30 m is honest for hand tracing).
