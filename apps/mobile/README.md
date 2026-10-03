# Mobile capture app

The team selected Android-only React Native; an Expo development build is the recommended starting point. Validate camera, location, background operation, and distance/VIO native-library support before committing. Expo Go does not include arbitrary custom native modules.

Implement session lifecycle, device/vehicle association, location metadata, travelled-distance sampling, lightweight image-quality checks, local pending upload queue, and resumable direct-to-S3 upload.

Follow `.kiro/specs/astig/requirements.md` and `docs/api/contract.md`. Validate distance sampling on target devices; do not substitute noisy GPS deltas for VIO without recording that limitation.

## Feasibility findings

Status: **IN PROGRESS. No device has been connected yet, so nothing below is a device measurement unless it says "measured on device".** Labels: **[measured]** = run on this machine or device; **[docs]** = inferred from package source or documentation, not verified on a device.

### Spike app (throwaway)

`apps/mobile` is an isolated Expo project (own `package.json` and `package-lock.json`), **not** in the root npm workspaces. `metro.config.js` blocks the repo-root `node_modules` so the web/backend install cannot leak in. It does not import `@astig/contracts`.

One screen (`App.tsx`):
- live GPS fix and reported horizontal accuracy;
- `GPS_DISTANCE` accumulated raw (every fix) and filtered (fixes with accuracy ≤ 20 m only);
- `VIO_DISTANCE` from the ARCore camera pose (horizontal x/z path while tracking is NORMAL), shown only in AR mode;
- a capture button (camera mode only); photos stay in the app cache;
- "Reset distances" and "Report" (prints a JSON summary with the error against a tape-measured reference, tagged `ASTIG_SPIKE` in logcat);
- an event log of AppState changes, GPS fix gaps over 5 s, and VIO tracking changes.

Distance logic is in `src/distance.ts` with tests in `src/distance.test.ts`.

Commands (from `apps/mobile`): `npm install`, `npm test`, `npm run typecheck`, `npm run android` (local dev build; needs the Android SDK), `npm start` (Metro for the dev client).

### Toolchain on Node 24 [measured, this PC]

| Check | Result |
| --- | --- |
| Node / npm | v24.15.0 / 11.12.1 |
| Expo SDK | 57 (`expo@57.0.26`, React Native 0.86.3, React 19.2.3) |
| `npx expo --version` | 57.0.27; runs on Node 24 |
| `npx expo-doctor` | 21/21 checks passed |
| `npx tsc --noEmit` | passes |
| `npm test` (`node --test`, 7 tests) | 7 pass |
| `npx expo export --platform android` | JS bundle builds (Hermes, 2.2 MB) |
| `npx expo prebuild --platform android --no-install` | native project generated. Manifest has CAMERA, FINE/COARSE location, and ARCore `optional` meta-data. No background-location permission. |
| JDK | OpenJDK 21.0.12 present. Not yet confirmed with a Gradle build. |
| Android SDK / adb | **Not installed.** `adb` is not on PATH, and `%LOCALAPPDATA%\Android\Sdk` does not exist. |
| Root workspace | `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts` unchanged |

Prebuild notes:
- **Gradle 9.3.1, compileSdk/targetSdk 36, minSdk 24, NDK 27.1** [docs: React Native 0.86 defaults].
- **Extra storage permissions:** prebuild adds `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) through dependencies. They are not used by the spike; review them before a real build.
- **Audit:** `npm audit` reports 23 advisories (7 moderate, 16 high), concentrated in build-time config tooling (`xcode`, `@expo/config-plugins`). They were not fixed in this spike.

### VIO candidate [docs, not yet verified on device]

- **No first-party module:** Expo has no first-party ARCore/VIO module.
- **Chosen candidate:** `@reactvision/react-viro@3.0.2` (ViroReact). It is maintained (published 2026-10-01), and its peer dependencies are pinned to Expo 57 / React Native 0.86. It ships an Expo config plugin (`android.xRMode: ["AR"]`). It exposes the ARCore camera pose (`onCameraTransformUpdate`), the tracking state (`onTrackingUpdated`), and `isARSupportedOnDevice()`.
- **Fallback:** a small local Expo module in Kotlin wrapping `com.google.ar.core.Session` camera pose, if Viro fails to build or is too heavy.
- **Camera conflict:** ARCore owns the camera while AR is active. The spike therefore cannot run `expo-camera` capture and VIO at the same time; capture in AR mode would need an AR-frame image. This is an architectural risk for the real capture app.

### Device results: PENDING

| Question | Status |
| --- | --- |
| 1. Dev build installs and launches; device model and Android version | Not tested: no SDK, adb, or device yet |
| 2. Camera capture and foreground location; outdoor reported accuracy | Not tested |
| 3. ARCore support; `VIO_DISTANCE` vs `GPS_DISTANCE` error over ≥ 50 m | Not tested |
| 4. Screen lock / background behavior | Not tested |

### Contract gaps (draft `packages/contracts/src/observation.ts`), preliminary

1. **No accuracy for the distance estimate itself.** `horizontalAccuracyM` is position accuracy, and `distanceFromPreviousM` has no uncertainty. Proposed: nullable `distanceAccuracyM`.
2. **No record of VIO tracking quality or gaps.** A `VIO_DISTANCE` value that spans a tracking loss is not a pure VIO measurement. Proposed: nullable `distanceTrackingLosses` (int), or a rule that a tracking loss forces that capture to `GPS_DISTANCE`/`MANUAL`.
3. **No session-level sampling configuration.** The configured interval (~7 m) is not recorded anywhere. Proposed: `samplingIntervalM` on the session-start request.
4. **`MANUAL` is undefined.** It is not specified whether this means a human tap with no distance. Proposed: `distanceFromPreviousM` must be `null` when `samplingMethod` is `MANUAL`.

These will be confirmed or revised after the device run.
