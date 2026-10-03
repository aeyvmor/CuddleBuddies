# Mobile capture app

The team selected Android-only React Native; an Expo development build is the recommended starting point. Validate camera, location, background operation, and distance/VIO native-library support before committing. Expo Go does not include arbitrary custom native modules.

Implement session lifecycle, device/vehicle association, location metadata, travelled-distance sampling, lightweight image-quality checks, local pending upload queue, and resumable direct-to-S3 upload.

Follow `.kiro/specs/astig/requirements.md` and `docs/api/contract.md`. Validate distance sampling on target devices; do not substitute noisy GPS deltas for VIO without recording that limitation.

## Capture app (two screens)

The operator is a driver or PUV operator: start a session, mount the phone, don't touch it again until Stop. The design is for a glance, not for reading. `App.tsx` switches between two screens without a navigation library.

1. **Session setup** (`src/screens/SetupScreen.tsx`):
   - device and vehicle labels, typed or picked from the five most recent;
   - capture interval, default 7 m, stepper or typed, 2–50 m;
   - distance source;
   - camera and location permission status;
   - Start;
   - a small "Diagnostics" entry for the team's measurement screen.

   Each permission shows a plain reason. If one is refused, the screen says what will not work and offers "Ask again", or "Open Settings" once Android stops asking. A session cannot start without both.
2. **Active session** (`src/screens/ActiveScreen.tsx`), largest first:
   - RECORDING, vehicle and device labels, and elapsed time;
   - distance travelled, and "Paused N times" if the app was off screen;
   - captured, failed and "to upload" counts, with the time of the last photo and of the last failure;
   - GPS reported accuracy and speed, with "No GPS fix" when there is none;
   - the distance source in words, plus AR tracking state for the AR source;
   - free storage and roughly how many more photos fit;
   - live view and latest-capture thumbnail;
   - "Capture now" and a larger red "Stop session", both 72 dp, which asks for confirmation. Android Back opens the same confirmation.

   The screen stays awake during a session.
   - **Portrait:** the two buttons share one row at the bottom, so status, distance, counts, GPS, speed and source fit above them without scrolling **[measured on the Redmi at 1.0× font]**.
   - **Landscape (dashboard mount):** the cards are paired two per row. The buttons sit in a side rail, Capture at the top and Stop (120 dp tall) at the bottom, far apart.
   - **Safe areas:** content stays out from under the status bar and, in landscape, the side navigation bar.

**Distance sources.** Each is labelled as what it is, and each sets the `samplingMethod` on every capture its trigger takes. A tap on "Capture now" is always recorded as `MANUAL` with `distanceFromPreviousM: null`, whatever the source: a tap makes no distance claim.

| Source (on screen) | `samplingMethod` | Image | What is known |
| --- | --- | --- | --- |
| GPS speed distance | `GPS_DISTANCE` | `expo-camera` photo, full resolution | Implemented and unit-tested only. Reads nothing indoors. **Never tried outdoors or in a vehicle.** |
| AR tracking with motion gate (marked experimental) | `VIO_DISTANCE` | Frame of the AR view (ARCore holds the camera) | **Measured indoors only**, hand-held, one room, at night: one measured 4 m walk tracked closely, and it stopped counting while the tester stood still. A single short sample. The 3 m/s plausibility limit means it does not count vehicle speeds. |
| Manual only | `MANUAL` | `expo-camera` photo | No distance trigger. |

The screens make no accuracy claim for any source. The only accuracy figure shown is the GPS receiver's own live report (for example "±8 m").

**Trigger.** It reuses `src/distance.ts` through `src/trigger.ts`, the same calls the diagnostics screen makes:
- **GPS:** speed-integrated distance (`gpsSpeedLiveM`), projected at most 2 s between fixes;
- **AR:** net displacement since the last capture (`vioSinceCaptureM` / `markVioCapture`).

There is no timer-based capture. A 250 ms tick only re-evaluates the distance trigger between GPS fixes, and the trigger is skipped while a capture is in flight, so an interval is never consumed without an attempt. A fix older than 10 s is not attached to a photo: the capture is recorded as failed (`NO_LOCATION_FIX`), never given a stale position.

**Local session and queue.** There is no upload in this build. The screens say so, and they show no upload progress, network state or "synced" indicator.
- **Queue entries (`src/queue.ts`):** each attempt becomes one entry. `CAPTURED` holds the image (with its size in bytes, which the upload route will need) and its contract-shaped `observation-capture.v0` record (`src/capture.ts`) with `upload: { state: "PENDING" }`. `FAILED` holds the reason. A failure is never converted into a capture.
- **Images:** moved out of the cache into the app's private `captures/` folder, named by `clientObservationId`. They are never put in the gallery.
- **Low storage:** checked before every photo (`src/storageGuard.ts`).
  - Below 500 MB free, the capture is refused and recorded as a `LOW_STORAGE` failure. Capture now is disabled, and a red "Storage full: photos stopped" chip appears.
  - Below 2 GB, an amber "Phone storage low" chip appears.
  - The "room for about N more photos" estimate uses the average size of this session's photos.
- **Adding an uploader later:** read `pendingUploads()` and extend `UploadState`; upload progress can be appended to the journal as new line kinds. The screens already show "to upload" from that state.
- **Session state (`src/session.ts`):** `IDLE → ACTIVE → STOPPING → ENDED → IDLE`. `STOPPING` waits for an in-flight capture to settle before ending.
- **Saving (`src/storage.ts`):**
  - Capture records are **appended** to `astig-queue.jsonl`, one JSON record per line (`src/journal.ts`). Each capture costs one small append, however long the route.
  - The session and settings are in `astig-state.json`. It is small (about 0.5–0.9 KB, measured) and rewritten write-then-replace on each change and every 15 s.
  - A line torn by a crash is counted and reported on the setup screen, never guessed. The saved sequence number is reconciled with the journal, so a number is never reused.
  - A v1 state file, from the first build, which kept the queue inside it, is migrated into the journal once at launch.
- **Rotation:** the activity is not recreated (`configChanges` includes orientation), so state persists.
- **Backgrounding:** recorded as a gap. Camera and location stop in the background; there is no background-location permission. GPS speed distance does not bridge gaps over 5 s, so nothing is invented.
- **App restart:** the running session resumes. The downtime is recorded as an `APP_NOT_RUNNING` gap, and the last shown distance is carried forward. The active screen shows "Paused N times". Interruptions less than 5 s apart count as one pause covering both. On the phone, a reinstall had produced two pauses (the app left the screen, then was stopped), which this fixes.
- **Unreadable saved data:** reported on the setup screen, and the file is moved aside, not deleted.
- **Timing logs:** `ASTIG_PERF` lines in logcat (`adb logcat -s ReactNativeJS:V`) give load, capture, keep, journal-append and state-save times. They hold no coordinates or image content.

**Theme.** `src/theme.ts` follows the Civic Pulse direction, with token names matching `apps/web/src/styles/tokens.css` where they apply. Components read only from the theme.
- As on the web, brand green `#00B14F` is decoration only. Text and filled buttons use `#006E2E`, and muted text is `#475569`.
- The type scale is larger than the web's, for reading at arm's length. Touch targets are at least 48 dp: 72 dp for Capture and Stop. Counter labels stay on one line, shrinking slightly rather than breaking mid-word, at large system font sizes.
- Every status colour is paired with words.
- Plus Jakarta Sans is **not bundled**, so the app uses the Android system font (Roboto).

**Device run-through (2026-10-04, Redmi Note 15 Pro 5G, Android 16, release build, indoors) [measured]:**

| Check | Result |
| --- | --- |
| 15 rapid taps on Capture now (about 0.4 s apart) | 15 captured, 0 failed. Photo 343–450 ms, move to private folder 8–42 ms, journal append 2–12 ms, state save 6–83 ms. Photos were 0.58–0.61 MB each, at 3060×4080, in a dim room, so outdoor photos will likely be larger. |
| Launch with 18 then 33 saved records | Load 6–16 ms, including the one-time v1 → journal migration. |
| Rotation to landscape and back | Session, clock and counts unchanged. Side rail and paired cards shown. |
| Home for 10–20 s, then return; app killed and relaunched; reinstall | Session resumed with the same counts each time, and each interruption counted as one pause. |
| Stop | Dialog with "Keep recording" / "Stop session". Back opens the same dialog. Keep recording continues. Stop shows the "Last session ended" summary (time, captured, failed, waiting). |
| Camera permission refused | "Camera: blocked", with what will not work and the Open Settings steps. Start explains that it needs camera and location. |
| System font 1.3× | Portrait and landscape readable. Fixed: the counter label broke as "CAPTUR / ED", and the vehicle/device labels wrapped one word per line. |
| Storage line | "86 GB free · room for about 154,000 more photos". The low and full thresholds are unit-tested only; the phone was not filled. |

Not checked on the phone: an outdoor or vehicle run, distance-triggered captures, the low-storage refusal, and whether the live view shows an image (it was black in every screenshot, probably because the phone was lying face down).

**Dependencies added in this phase:**
- `react-native-safe-area-context` (~5.7.0): a **new native module**. Edge-to-edge is on (React Native 0.86 default), so content would otherwise sit under the status and navigation bars, including the Stop button.
- `expo-keep-awake` and `expo-file-system` (~57.0.x): declared directly so the imports resolve. Both were **already compiled into the app** as dependencies of `expo` (listed by `expo-modules-autolinking resolve`), so neither adds native code.

**Not built:** sign-in, the device/vehicle registry, upload, the map, frame-quality filtering and background capture.

## Feasibility findings (spike)

Status: **Indoor-only spike, now the Diagnostics screen. Expo: go. `VIO_DISTANCE`: offered in the capture app only as an experimental, motion-gated option, and not recommended as the default. See "Go / no-go".** Labels: **[measured]** = run on this machine or device; **[docs]** = inferred from package source or documentation, not verified on a device.

### Spike app (now the Diagnostics screen)

`apps/mobile` is an isolated Expo project (own `package.json` and `package-lock.json`), **not** in the root npm workspaces. `metro.config.js` blocks the repo-root `node_modules` so the web/backend install cannot leak in. It does not import `@astig/contracts`.

The spike screen moved, unchanged in behavior, from `App.tsx` to `src/screens/DiagnosticsScreen.tsx`. It is reachable from session setup through "Diagnostics", and only a "Back to session setup" button was added. It shows:
- live GPS fix and reported horizontal accuracy;
- `GPS_DISTANCE` accumulated raw (every fix) and filtered (fixes with accuracy ≤ 20 m only);
- `VIO_DISTANCE` from the ARCore camera pose (horizontal x/z path while tracking is NORMAL), shown only in AR mode, as a stepped total and a per-update sum;
- capture: manual, or automatic every N metres (default 7) of the active method's distance, never on a timer. Camera mode takes an `expo-camera` photo; AR mode saves a frame of the AR view. Images stay in the app's private storage;
- each capture logs a record in the draft `observation-capture.v0` shape (`src/capture.ts`); a failed capture is logged as a failure;
- "Reset distances" and "Report" (prints a JSON summary with the error against a tape-measured reference, tagged `ASTIG_SPIKE` in logcat);
- an event log of AppState changes, GPS fix gaps over 5 s, and VIO tracking changes.

Distance logic is in `src/distance.ts`, capture metadata in `src/capture.ts` and the motion gate in `src/motion.ts`. The capture app adds `src/session.ts`, `src/queue.ts`, `src/trigger.ts`, `src/sources.ts`, `src/permissions.ts`, `src/persist.ts`, `src/journal.ts` and `src/storageGuard.ts`. Each pure module has tests beside it: 76 tests in total.

Commands (from `apps/mobile`): `npm install`, `npm test`, `npm run typecheck`. For the release build that runs unplugged, run `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` in `android/`, then `adb install -r app/build/outputs/apk/release/app-release.apk`. After changing `app.json`, run `npx expo prebuild --platform android --no-install --no-clean`.

### Vehicle mode: GPS speed distance (implemented, **untested outdoors**)

Position differences jitter by metres even when parked, and a 7 m interval is about the size of that jitter. Distance is therefore integrated from the receiver's reported ground speed (Doppler), not from position differences (`addGpsFix` / `gpsSpeedLiveM` in `src/distance.ts`):
- **Formula:** trapezoid of speed × time between consecutive accepted fixes.
- **Accepted fixes:** reported accuracy ≤ 20 m, and both fixes report a speed.
- **Below 1.0 m/s:** treated as stopped and not counted.
- **Gaps over 5 s:** not bridged; the gap is reported instead.
- **Between fixes:** the last speed is projected for at most 2 s, so the trigger does not wait for the next 1 Hz fix.

It is unit-tested only. Indoors it reads nothing (no speed). It has never been run outdoors or in a vehicle.

### Toolchain on Node 24 [measured, this PC]

| Check | Result |
| --- | --- |
| Node / npm | v24.15.0 / 11.12.1 |
| Expo SDK | 57 (`expo@57.0.26`, React Native 0.86.3, React 19.2.3) |
| `npx expo --version` | 57.0.27; runs on Node 24 |
| `npx expo-doctor` | 21/21 checks passed |
| `npx tsc --noEmit` | passes |
| `npm test` (`node --test`) | 76 pass (29 spike + 47 capture app) |
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

Idea from the team: count AR movement only while an independent sensor says the device is really travelling. `src/motion.ts` judges that from three signals:
- **Accelerometer:** walking bounce, measured as the standard deviation of acceleration magnitude over a window.
- **Gyroscope:** a veto when rotation is too fast.
- **GPS speed:** an alternative for bounce-free travel such as a vehicle.

Missing or stale sensor data counts as not moving, so the gate fails closed. ARCore keeps running, and its updates are ignored while the gate is closed. Uses `expo-sensors`, which adds the `ACTIVITY_RECOGNITION` permission to the manifest (declared, never requested).

Current thresholds (`DEFAULT_MOTION_CONFIG`), tuned from the indoor readings and not validated beyond them:

| Setting | Value | Basis |
| --- | --- | --- |
| Window | 1000 ms | Spans two steps at walking cadence, and closes the gate sooner after a stop |
| Minimum bounce | 0.045 g | Hand-held walking on the test phone measured 0.05–0.12 g; at rest below 0.02 g **[measured indoors]** |
| Rotation veto | > 1.0 rad/s | Starting value |
| GPS speed that counts as travel | ≥ 1.0 m/s | Starting value |
| Stale sensor reading | > 1000 ms | Starting value |

The first gated minute (earlier thresholds 0.12 g / 1.5 s / 1.5 m/s) ignored 947 pose updates and counted 2.8 m, against 24 m ungated.

**[measured indoors]** With the motion gate on, one measured 4 m walk was tracked closely, and counting stopped while the tester stood still. This is one short hand-held sample, in one room, at night. This README does not record the exact figure, or whether the thresholds above were already in place for that run. A controlled pan-only run with these thresholds, a longer measured walk, daylight, outdoors and a vehicle mount are **not tested**.

### Go / no-go

- **Expo development build: go.** Camera, location and a third-party ARCore module all build and run on the target phone.
- **`VIO_DISTANCE` as the capture trigger: no-go for now.** Without the motion gate it produced false captures with the tester standing still. With the gate there is one short, good indoor sample (above), which is not enough to call it safe. Sending `samplingMethod: VIO_DISTANCE` with distances the device did not travel would misstate the evidence. The capture app offers it only as "AR tracking with motion gate", marked experimental.
- **Recommended for the hackathon capture app:** GPS speed distance (`GPS_DISTANCE`), with "Capture now" (`MANUAL`) always available, using the `expo-camera` photo (3060x4080).
  - Outdoor and in-vehicle GPS behavior is still **untested**.
  - Indoors, position accuracy was ±4 to ±21 m and speed was not reported, so nothing was counted. The speed-integrated mode was built for that reason.
  - If it does not work on demo day, use the clearly labelled synthetic route, as the hackathon plan already allows.
- **VIO stays a documented future option**, to be re-tested with the phone mounted in a vehicle in daylight. Note that the capture app's 3 m/s plausibility limit stops AR from counting vehicle speeds today.
- **Still untested:**
  - a measured outdoor walk for any method;
  - outdoor `GPS_DISTANCE` and any in-vehicle use;
  - distance-triggered auto-capture producing the expected count on a real route;
  - screen-lock and background behavior on the device. The capture app records them as gaps, which is unit-tested only.

### Contract gaps (draft `packages/contracts/src/observation.ts`), preliminary

1. **No accuracy for the distance estimate itself.** `horizontalAccuracyM` is position accuracy, and `distanceFromPreviousM` has no uncertainty. Proposed: nullable `distanceAccuracyM`.
2. **No record of VIO tracking quality or gaps.** A `VIO_DISTANCE` value that spans a tracking loss is not a pure VIO measurement. Proposed: nullable `distanceTrackingLosses` (int), or a rule that a tracking loss forces that capture to `GPS_DISTANCE`/`MANUAL`.
3. **No session-level sampling configuration.** The configured interval (~7 m) is not recorded anywhere. Proposed: `samplingIntervalM` on the session-start request.
4. **`MANUAL` is undefined.** It is not specified whether this means a human tap with no distance. Proposed: `distanceFromPreviousM` must be `null` when `samplingMethod` is `MANUAL`.

Gaps 1 and 2 were hit on the device: the spike logs tracking losses since the previous capture in a `spike` object outside the contract shape, because the contract has nowhere to put them.

### Contract items that shaped the capture app UI

5. **Device and vehicle IDs.** `CreateSessionRequest` needs registered `deviceId` and `vehicleId` UUIDs, and there is no route to list or look them up. The setup screen therefore takes free-text **labels**, kept on the phone only. Registering a session will need a lookup route, or a configured ID per phone.
6. **No session-level field for the distance source or interval.** The choice is recorded per capture as `samplingMethod`, and `intervalM` is local (gap 3).
7. **A tap is `MANUAL` in every mode.** The contract has one `samplingMethod` per observation. A manual tap during a GPS session cannot be `GPS_DISTANCE` without claiming a distance, so it is recorded as `MANUAL` with `distanceFromPreviousM: null`. This implements the proposal in gap 4.
8. **Session routes exist but are not used.** `services/api` has `POST /sessions`, `PATCH /sessions/{id}`, `POST /sessions/{id}/observations` and `POST /upload-url`, all with role `OPERATOR` and Cognito sign-in. This build does not call them: there is no sign-in on the phone, and the task kept the session local. The local record keeps the fields those routes need (`clientSessionId`, `startedAt`, `endedAt`, `startLocation`, the capture requests), so an uploader can be added without changing the screens.
9. **Gaps when the app was not running.** The contract cannot express them. They are local only and shown on screen.
