# Demo data from Manila dashcam footage (plan)

Status: **plan, pending answers to the open questions below.** Owner: backend/AWS (replay tooling), with the team for footage selection and redaction.

## Goal

Use real Manila street footage as the demo evidence while staying honest about how it was captured. The footage goes through the **same API, S3 upload, worker, scoring and work-order path** as a live capture. Only the *capture device* is simulated: a replay tool stands in for the phone.

## Pipeline

```text
dashcam video (+ GPS track) ──► 1. track     GPS points with timestamps (embedded GPS, or hand-traced route)
                                2. plan      a capture point every ~7 m of travelled distance along the track
                                3. extract   one still frame per capture point (ffmpeg), kept off Git and off S3
                                4. curate    drop unusable frames; blur faces and plates; human check
                                5. replay    POST /sessions → POST /sessions/{id}/observations → POST /upload-url → PUT
                                             (operator login via Cognito; idempotent ids, safe to re-run)
                                6. process   the S3 event triggers the worker → vision provider → validated detection
                                             or explicit FAILED → issue association → risk.v0 score
                                7. operate   officer reviews in the web app → work order → resolved → analytics/QuickSight
```

### 1. GPS track

- **If the dashcam embeds GPS** (many do in the MP4 metadata): extract the track with `exiftool -ee -n -p '$gpsdatetime,$gpslatitude,$gpslongitude,$gpsspeed' video.mp4`, or with the dashcam vendor's player export (GPX/NMEA). `horizontalAccuracyM` stays `null` unless the file records it.
- **If it doesn't:** hand-trace the route on a map along the roads visible in the video, save it as a GPX file, and assign timestamps from the video timeline with an assumed constant speed per segment. These coordinates are approximate. The replay must label them that way (see *Labeling*) and set `horizontalAccuracyM` to a stated estimate, e.g. 15 m, never `null`-as-exact.

### 2. Distance-based sampling

Walk the track, add up haversine distances, and emit a capture point every `intervalM` (default 7 m). This is the same rule as the mobile client, so the demo still shows distance-based (not timer-based) sampling. `distanceFromPreviousM` is the computed spacing.

### 3–4. Frames, curation and privacy

- Extract JPEGs at the planned video offsets (`ffmpeg -ss <t> -i video.mp4 -frames:v 1 -q:v 3 out.jpg`), under 10 MiB each.
- Keep raw video and extracted frames **out of Git** (they're in `.gitignore`) and out of shared drives the team hasn't agreed on. Only curated, redacted frames are uploaded.
- **Redaction:**
  - Blur visible faces and licence plates before upload. A face-blur tool (e.g. `deface`) plus manual plate boxes is enough for a demo.
  - A second person checks every uploaded frame.
  - Drop frames that can't be cleaned well.
- Curate down to a small, convincing set: roughly 20–60 frames, including a few clear drainage or road issues and some "nothing to see" frames.

### 5. Replay through the real API

- A replay CLI (proposed `tools/dashcam-replay/`, Node + TypeScript, no new runtime services) signs in as an `OPERATOR` Cognito user and drives the real endpoints.
- **Identifiers are deterministic**: `clientSessionId` and `clientObservationId` are UUIDv5 values derived from the video hash and frame index. Re-running after a network failure therefore replays safely (idempotent API), and nothing is duplicated.
- `capturedAt` is the footage's real time when known (embedded GPS time). Otherwise it's the video timeline offset from a stated start time, recorded in the replay manifest.
- Register one device and vehicle for the replay through the admin Lambda, with an explicit label such as `Dashcam replay rig (demo)`.

### 6. Vision results (choose one, label it truthfully)

| Option | When | What the UI shows |
| --- | --- | --- |
| Live Gemini adapter | Key and quota available | Real model output on real frames (`modelVersion` = Gemini model id) |
| Annotated fixtures | Gemini unavailable | A `fixture` provider returns **human-written labels** for each frame (`modelVersion: "human-annotation-v0"`). Presented as "pre-labeled demo result", never as live AI |
| None | Neither ready | Frames show `FAILED: PROVIDER_NOT_CONFIGURED`; the seeded synthetic issues carry the demo |

## Labeling (no misrepresentation)

- Replay sessions and observations are demo data, not live ASTIG captures. The replay device is registered as **synthetic/demo**, so every derived row has `isSynthetic = true` and the existing demo badges and `includesSynthetic` flags apply.
- **Proposed contract change (needs team approval):** add `samplingMethod: "DASHCAM_REPLAY"`, so a replayed frame is never presented as on-device GPS/VIO sampling. Implementation is a small migration widening the check constraint, plus the Zod enum.
- The demo script says plainly: "real Manila street footage, replayed through ASTIG; capture timing simulated; locations from the dashcam GPS / hand-traced."

## Open questions (answer before building)

1. **Source and rights:** who recorded the footage? Team-recorded footage is fine. Footage downloaded from YouTube or social media needs the owner's written permission, or a licence that allows this use; otherwise don't use it (see `docs/architecture/decisions.md`).
2. **GPS:** does the dashcam file contain GPS (brand/model?), or is there only an on-screen overlay or nothing?
3. **Vision provider:** will Gemini be ready, or should I build the annotated-fixture provider?
4. **Contract:** approve `DASHCAM_REPLAY` as a `samplingMethod` value?
5. **Areas:** should replayed issues carry an area name (e.g. city or barangay)? That needs a small, attributed boundary dataset (e.g. OpenStreetMap, ODbL). Otherwise `areaName` stays `null`.

## Deliverables once answered

`tools/dashcam-replay` (plan/extract/replay commands with tests for distance sampling, deterministic ids and idempotent re-runs); optional `fixture` vision provider with schema-validated annotations; migration for `DASHCAM_REPLAY`; runbook steps.
