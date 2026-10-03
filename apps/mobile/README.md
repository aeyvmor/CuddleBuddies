# Mobile capture app

The team selected Android-only React Native; an Expo development build is the recommended starting point. Validate camera, location, background operation, and distance/VIO native-library support before committing. Expo Go does not include arbitrary custom native modules.

Implement session lifecycle, device/vehicle association, location metadata, travelled-distance sampling, lightweight image-quality checks, local pending upload queue, and resumable direct-to-S3 upload.

Follow `.kiro/specs/astig/requirements.md` and `docs/api/contract.md`. Validate distance sampling on target devices; do not substitute noisy GPS deltas for VIO without recording that limitation.

## Feasibility findings

Status: **Spike complete for an indoor-only test. Expo: go. `VIO_DISTANCE` as the trigger: no-go for now. See "Go / no-go".** Labels: **[measured]** = run on this machine or device; **[docs]** = inferred from package source or documentation, not verified on a device.

### Spike app (throwaway)

`apps/mobile` is an isolated Expo project (own `package.json` and `package-lock.json`), **not** in the root npm workspaces. `metro.config.js` blocks the repo-root `node_modules` so the web/backend install cannot leak in. It does not import `@astig/contracts`.

One screen (`App.tsx`):
- live GPS fix and reported horizontal accuracy;
- `GPS_DISTANCE` accumulated raw (every fix) and filtered (fixes with accuracy ≤ 20 m only);
- `VIO_DISTANCE` from the ARCore camera pose (horizontal x/z path while tracking is NORMAL), shown only in AR mode, as a stepped total and a per-update sum;
- capture: manual, or automatic every N metres (default 7) of the active method's distance, never on a timer. Camera mode takes an `expo-camera` photo; AR mode saves a frame of the AR view. Images stay in the app's private storage;
- each capture logs a record in the draft `observation-capture.v0` shape (`src/capture.ts`); a failed capture is logged as a failure;
- "Reset distances" and "Report" (prints a JSON summary with the error against a tape-measured reference, tagged `ASTIG_SPIKE` in logcat);
- an event log of AppState changes, GPS fix gaps over 5 s, and VIO tracking changes.

Distance logic is in `src/distance.ts` and capture metadata in `src/capture.ts`, each with tests beside it.

Commands (from `apps/mobile`): `npm install`, `npm test`, `npm run typecheck`, `npm run android` (local dev build; needs the Android SDK), `npm start` (Metro for the dev client).

### Toolchain on Node 24 [measured, this PC]

| Check | Result |
| --- | --- |
| Node / npm | v24.15.0 / 11.12.1 |
| Expo SDK | 57 (`expo@57.0.26`, React Native 0.86.3, React 19.2.3) |
| `npx expo --version` | 57.0.27; runs on Node 24 |
| `npx expo-doctor` | 21/21 checks passed |
| `npx tsc --noEmit` | passes |
| `npm test` (`node --test`, 25 tests) | 25 pass |
| `npx expo export --platform android` | JS bundle builds (Hermes, 2.2 MB) |
| `npx expo prebuild --platform android --no-install` | native project generated. Manifest has CAMERA, FINE/COARSE location, and ARCore `optional` meta-data. No background-location permission. |
| JDK | OpenJDK 21.0.12; Gradle release build succeeds (12 min first build, under 2 min after). |
| Android SDK / adb | Installed 2026-10-04: API 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1; `adb` on PATH; `ANDROID_HOME` set. |
| Root workspace | `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts` unchanged |

Prebuild notes:
- **Gradle 9.3.1, compileSdk/targetSdk 36, minSdk 24, NDK 27.1** [docs: React Native 0.86 defaults].
- **Extra storage permissions:** prebuild adds `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) through dependencies. They are not used by the spike; review them before a real build.
- **Audit:** `npm audit` reports 23 advisories (7 moderate, 16 high), concentrated in build-time config tooling (`xcode`, `@expo/config-plugins`). They were not fixed in this spike.

### VIO candidate [docs; builds and runs on the device, see Device results]

- **No first-party module:** Expo has no first-party ARCore/VIO module.
- **Chosen candidate:** `@reactvision/react-viro@3.0.2` (ViroReact). It is maintained (published 2026-10-01), and its peer dependencies are pinned to Expo 57 / React Native 0.86. It ships an Expo config plugin (`android.xRMode: ["AR"]`). It exposes the ARCore camera pose (`onCameraTransformUpdate`), the tracking state (`onTrackingUpdated`), and `isARSupportedOnDevice()`.
- **Fallback:** a small local Expo module in Kotlin wrapping `com.google.ar.core.Session` camera pose, if Viro fails to build or is too heavy.
- **Camera conflict:** ARCore owns the camera while AR is active. The spike therefore cannot run `expo-camera` capture and VIO at the same time; capture in AR mode would need an AR-frame image. AR-frame capture was then shown to work on the device (result 3b), at the AR view's resolution.

### Device results (2026-10-04)

Device: Xiaomi REDMI Note 15 Pro 5G (model 25080RABDG), Android 16. All testing was indoors; the team could not go outside. Built with `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (standalone, JS bundled, so it runs unplugged) and installed with `adb install -r`. The first build needed NDK 27.1.12297006 reinstalled, because an interrupted earlier install had left an empty folder.

| Question | Result |
| --- | --- |
| 1. Build installs and launches | **[measured]** Yes. Xiaomi needs "Install via USB" enabled in Developer options. This is a release build with `expo-dev-client` included; the Metro dev-client workflow was not exercised. |
| 2. Camera capture and foreground location | **[measured]** `expo-camera` photo: 3060x4080 px. Location works. Indoors the reported accuracy ranged from ±4.4 to ±21.5 m, with fixes 5–8 s apart. Outdoor accuracy is **not tested**. |
| 3. ARCore support and distance source | **[measured]** ARCore is supported. In a lit room tracking held NORMAL with 0 losses while the phone was carried about 17 m. Accuracy against a measured reference is **not established** (see below). `GPS_DISTANCE` is **not testable indoors**. |
| 3b. Capture while ARCore holds the camera | **[measured]** Works: a frame of the AR view is saved with `takeScreenshot`, 1280x975 px (the size of the AR view on screen, not the sensor resolution). |
| 4. Screen lock / background behavior | **Not tested.** |

Capture metadata: both capture paths logged a record in the draft `observation-capture.v0` shape (schema version, client UUID, sequence number, UTC time, location, horizontal accuracy, sampling method, distance from previous). A capture with no location fix is refused and logged as `CAPTURE_FAILED NO_LOCATION_FIX`; that path is unit-tested, not exercised on the device. Only `MANUAL` captures were made on the device. Distance-triggered auto-capture is implemented and its trigger is unit-tested, but it has **not been run on a walk**.

Distance accuracy, what exists:

| Trial | Result | Valid? |
| --- | --- | --- |
| Dim room, about 02:20, 10 m estimated by eye, per-update sum only | 14.68 m (+46.8%), 4 tracking losses in about 14 s; GPS 0.12 m | **No.** The reference was not measured, and the per-update sum counts hand sway and pose jitter (it reached 40 m while the phone was carried back to a desk). |
| Lit room, unmeasured movement | 16.6 m stepped vs 19.3 m per-update sum, 0 tracking losses | Not an accuracy result (no reference). It shows the per-update sum reading about 16% above the stepped counter, and that tracking is stable in good light. |

Panning the phone in place also raised both path totals **[measured, observed by the tester]**: the camera really does move through an arc at arm's length, and a path sum never decreases. The capture trigger therefore no longer uses a path total. In AR mode it uses the straight-line horizontal displacement from the last capture point (`vioSinceCaptureM`), banked across tracking losses, which panning in place should not push to the interval. That holds in the unit tests but **failed on the device** (next section), because the position estimate itself drifts. The report gives `VIO_DISTANCE_net_m` (straight-line from reset, valid only for a straight one-way walk) beside the stepped and per-update path totals. Net displacement under-reads a curved path between two captures; at a 7 m interval on a road that is small, but it is an assumption, not a measurement.

### Pan-in-place tests: ARCore position is not stable **[measured]**

The tester stood still and panned the phone left and right, in AR mode, in the same lit indoor room (large screens with changing content, people moving, about 03:00 local).

| Run | What happened |
| --- | --- |
| Net-displacement trigger, no speed filter, auto-capture on | 5 auto-captures in about 25 s, each claiming about 7 m (`distanceFromPreviousM` 7.02–7.59). Two were 1.2 s apart. 8 tracking losses. |
| Same, with a 3 m/s speed filter and raw pose telemetry (auto-capture was off in this run) | After about 45 s: net 24.0 m, stepped 20.9 m, per-update 26.7 m, 12 tracking losses, 65 leaps rejected (91 two seconds later). |

Raw pose telemetry from the second run (ARCore camera position via `onCameraTransformUpdate`, before any filtering by the spike):

- For about 10 s the reported position moved steadily in one direction, from z = −2.9 to z = −30.4, at roughly 1–4 m/s, while tracking was mostly reported as NORMAL.
- It then snapped back by about 12 m in a single update, twice.
- Once the phone was put down the position stopped changing completely.

What this shows: on this phone, with this library, in this room, the position estimate runs away when the camera only rotates, and the tracking state does not reliably flag it. A speed filter removes the snaps but cannot remove drift at walking speed, because it looks like walking. The spike's banking of net displacement across each loss or rejected leap also turns the net figure back into a sum of short chords when glitches are frequent, so the net trigger is not a defence here either.

What this does not show: behavior in daylight, outdoors, with the phone fixed to a vehicle (no panning), or with a different ARCore integration. None of those was tested. The likely cause (no parallax under pure rotation, so the estimate falls back on drifting inertial sensors; moving screen content and people) is an inference from the pattern, not something the spike verified.

### Motion gate (added after the pan tests; first look only)

Idea from the team: count AR movement only while an independent sensor says the device is really travelling. `src/motion.ts` judges that from the accelerometer (walking bounce: standard deviation of acceleration magnitude ≥ 0.12 g over 1.5 s), with a gyroscope veto (rotation > 1.0 rad/s) and GPS speed (≥ 1.5 m/s) as an alternative for bounce-free travel such as a vehicle. Missing sensor data counts as not moving. ARCore keeps running; its updates are ignored while the gate is closed. The thresholds are starting guesses, not tuned values. Uses `expo-sensors`, which adds the `ACTIVITY_RECOGNITION` permission to the manifest (declared, never requested by the spike).

First look on the device **[measured]**, one uncontrolled minute in AR mode with the gate on (what the tester did during it was not recorded): 947 pose updates ignored, net distance 2.8 m, against 24 m in the ungated pan test. Per-second verdicts: 38 STILL, 15 ROTATING, 4 WALKING_BOUNCE, 1 NO_SENSOR_DATA. Bounce while hand-held reached 0.10–0.11 g at the 90th percentile, close to the 0.12 g threshold, so the margin is thin.

Not yet done: a controlled pan-only run, and a measured walk to confirm the gate opens while walking and the distance is right. Until both exist this does not change the no-go below.

### Go / no-go

- **Expo development build: go.** Camera, location and a third-party ARCore module all build and run on the target phone.
- **`VIO_DISTANCE` as the capture trigger: no-go for now.** It produced false captures with the tester standing still, and nothing tested so far makes it safe. Sending `samplingMethod: VIO_DISTANCE` with distances the device did not travel would misstate the evidence.
- **Recommended for the hackathon capture app:** `GPS_DISTANCE` with `MANUAL` capture always available, both labelled as such, using the `expo-camera` photo (3060x4080). Outdoor GPS behavior is still **untested**; indoors it was too coarse for a 7 m interval (±4 to ±21 m, fixes 5–8 s apart), so the interval may need to be larger than 7 m and the limitation stated. If neither works on demo day, use the clearly labelled synthetic route, as the hackathon plan already allows.
- **VIO stays a documented future option**, to be re-tested with the phone mounted in a vehicle in daylight, and probably fused with GPS speed (count VIO movement only when GPS agrees the device is moving). That is beyond this spike.
- **Still untested:** a measured walk for any method, outdoor `GPS_DISTANCE`, in-vehicle use, screen-lock behavior, and distance-triggered auto-capture producing the expected count on a real walk.

### Contract gaps (draft `packages/contracts/src/observation.ts`), preliminary

1. **No accuracy for the distance estimate itself.** `horizontalAccuracyM` is position accuracy, and `distanceFromPreviousM` has no uncertainty. Proposed: nullable `distanceAccuracyM`.
2. **No record of VIO tracking quality or gaps.** A `VIO_DISTANCE` value that spans a tracking loss is not a pure VIO measurement. Proposed: nullable `distanceTrackingLosses` (int), or a rule that a tracking loss forces that capture to `GPS_DISTANCE`/`MANUAL`.
3. **No session-level sampling configuration.** The configured interval (~7 m) is not recorded anywhere. Proposed: `samplingIntervalM` on the session-start request.
4. **`MANUAL` is undefined.** It is not specified whether this means a human tap with no distance. Proposed: `distanceFromPreviousM` must be `null` when `samplingMethod` is `MANUAL`.

Gaps 1 and 2 were hit on the device: the spike logs tracking losses since the previous capture in a `spike` object outside the contract shape, because the contract has nowhere to put them.
