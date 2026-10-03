/**
 * THROWAWAY FEASIBILITY SPIKE. Not the capture app.
 * One screen: live GPS (fix, reported accuracy), accumulated distance per method,
 * and distance-sampled capture (automatic at a configurable interval, or manual).
 * No session, queue, upload, API or styling work.
 *
 * Distance methods are labelled exactly as the draft contract's samplingMethod
 * values: GPS_DISTANCE is never presented as VIO_DISTANCE. In AR mode ARCore owns
 * the camera, so the image is a frame of the AR view, not an expo-camera photo.
 * Captured images stay in the app cache; they are never uploaded or committed.
 */
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AppState, Button, Image, ScrollView, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";
import { ViroARScene, ViroARSceneNavigator, ViroTrackingStateConstants, isARSupportedOnDevice } from "@reactvision/react-viro";
import { buildCaptureRequest, type SamplingMethod } from "./src/capture";
import { accelStdG, addAccel, DEFAULT_MOTION_CONFIG, initialMotionState, judgeMotion, setGpsSpeed, setGyro, type MotionVerdict } from "./src/motion";
import {
  addGpsFix,
  addVioPose,
  DEFAULT_GPS_SPEED_CONFIG,
  gpsSpeedLiveM,
  initialGpsState,
  initialVioState,
  markVioCapture,
  percentError,
  setVioTracking,
  shouldCapture,
  vioNetFromStartM,
  vioSinceCaptureM,
  type GpsDistanceState,
  type VioDistanceState,
  type VioTracking,
} from "./src/distance";

const MAX_ACCURACY_M = 20;
const FIX_GAP_LOG_MS = 5_000;
const LOG_TAG = "ASTIG_SPIKE";
const DEFAULT_INTERVAL_M = "7";
/** Walking-test default. A vehicle needs a higher limit; this is a spike setting, not a product value. */
const DEFAULT_MAX_SPEED_MPS = "3";
const POSE_DIAG_MS = 1000;
const SENSOR_INTERVAL_MS = 50;

interface FrameResult {
  success?: boolean;
  url?: string;
  errorCode?: number;
}

/** Module-level sink so the Viro scene (rendered by the navigator) can report to the screen. */
const vioSink: {
  onPose?: (p: [number, number, number]) => void;
  onTracking?: (t: VioTracking) => void;
  takeFrame?: (fileName: string) => Promise<FrameResult>;
} = {};

function VioScene(props: { arSceneNavigator?: { takeScreenshot: (fileName: string, saveToCameraRoll: boolean) => Promise<FrameResult> } }) {
  const nav = props.arSceneNavigator;
  useEffect(() => {
    // saveToCameraRoll is false: frames stay in app storage, never in the gallery.
    vioSink.takeFrame = nav ? (fileName) => nav.takeScreenshot(fileName, false) : undefined;
    return () => {
      vioSink.takeFrame = undefined;
    };
  }, [nav]);
  return (
    <ViroARScene
      onTrackingUpdated={(state) => {
        const t: VioTracking =
          state === ViroTrackingStateConstants.TRACKING_NORMAL
            ? "NORMAL"
            : state === ViroTrackingStateConstants.TRACKING_LIMITED
              ? "LIMITED"
              : "UNAVAILABLE";
        vioSink.onTracking?.(t);
      }}
      onCameraTransformUpdate={(t) => vioSink.onPose?.(t.position)}
    />
  );
}

type Mode = "CAMERA" | "VIO";

interface LogLine {
  at: string;
  text: string;
}

interface Shot {
  uri: string;
  width: number;
  height: number;
  source: "AR_FRAME" | "CAMERA";
}

const imageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject),
  );

export default function App() {
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [locGranted, setLocGranted] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("CAMERA");
  const [arSupport, setArSupport] = useState<string>("not checked");
  const [gps, setGps] = useState<GpsDistanceState>(initialGpsState);
  const [vio, setVio] = useState<VioDistanceState>(initialVioState);
  const [referenceM, setReferenceM] = useState("50");
  const [intervalM, setIntervalM] = useState(DEFAULT_INTERVAL_M);
  const [maxSpeed, setMaxSpeed] = useState(DEFAULT_MAX_SPEED_MPS);
  const maxSpeedRef = useRef(maxSpeed);
  maxSpeedRef.current = maxSpeed;
  /** Raw pose telemetry between diagnostic lines: what ARCore reports before any filtering. */
  const diag = useRef<{ n: number; maxStep: number; path: number; last: [number, number, number] | null }>({ n: 0, maxStep: 0, path: 0, last: null });
  // Motion gate: AR distance only counts while an independent sensor says the device is travelling.
  const [gateOn, setGateOn] = useState(true);
  const gateOnRef = useRef(gateOn);
  gateOnRef.current = gateOn;
  const motion = useRef(initialMotionState);
  const [motionView, setMotionView] = useState<{ verdict: MotionVerdict; stdG: number | null; gyro: number | null }>({
    verdict: { moving: false, reason: "NO_SENSOR_DATA" },
    stdG: null,
    gyro: null,
  });
  const [auto, setAuto] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [captures, setCaptures] = useState(0);
  const [failures, setFailures] = useState(0);
  const [lastShot, setLastShot] = useState<(Shot & { label: string }) | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const lastFixMs = useRef<number | null>(null);

  // Latest values for the async capture path, which must not read stale render state.
  const gpsRef = useRef(gps);
  gpsRef.current = gps;
  const vioRef = useRef(vio);
  vioRef.current = vio;
  const sequence = useRef(0);
  const busy = useRef(false);
  /** GPS distance total at the previous capture. VIO keeps its own since-capture tracker in state. */
  const lastGpsCaptureAt = useRef(0);
  const lossesAtLastCapture = useRef(0);

  const addLog = (text: string) => {
    const line = { at: new Date().toISOString(), text };
    console.log(`${LOG_TAG} ${line.at} ${text}`);
    setLog((l) => [line, ...l].slice(0, 60));
  };

  useEffect(() => {
    vioSink.onTracking = (t) => {
      setVio((s) => setVioTracking(s, t));
      addLog(`VIO tracking ${t}`);
    };
    vioSink.onPose = ([x, y, z]) => {
      const d = diag.current;
      if (d.last) {
        const step = Math.hypot(x - d.last[0], z - d.last[2]);
        d.maxStep = Math.max(d.maxStep, step);
        d.path += step;
      }
      d.n += 1;
      d.last = [x, y, z];
      const limit = Number(maxSpeedRef.current);
      const tMs = Date.now();
      const moving = gateOnRef.current ? judgeMotion(motion.current, tMs).moving : undefined;
      setVio((s) => addVioPose(s, { x, y, z }, { tMs, maxSpeedMps: limit > 0 ? limit : Infinity, moving }));
    };
    Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);
    const accelSub = Accelerometer.addListener(({ x, y, z }) => {
      motion.current = addAccel(motion.current, Date.now(), x, y, z, DEFAULT_MOTION_CONFIG.windowMs);
    });
    const gyroSub = Gyroscope.addListener(({ x, y, z }) => {
      motion.current = setGyro(motion.current, Date.now(), x, y, z);
    });
    const motionTimer = setInterval(() => {
      setMotionView({ verdict: judgeMotion(motion.current, Date.now()), stdG: accelStdG(motion.current), gyro: motion.current.gyro?.rateRadS ?? null });
    }, 250);
    // Console-only telemetry (logcat), once a second while poses arrive.
    const diagTimer = setInterval(() => {
      const d = diag.current;
      if (d.n === 0 || !d.last) return;
      const v = judgeMotion(motion.current, Date.now());
      console.log(
        `${LOG_TAG} ${new Date().toISOString()} POSE gate=${gateOnRef.current ? v.reason : "off"} accelStdG=${accelStdG(motion.current)?.toFixed(3) ?? "n/a"} gyro=${motion.current.gyro?.rateRadS.toFixed(2) ?? "n/a"} updates=${d.n} rawPath=${d.path.toFixed(2)} maxStep=${d.maxStep.toFixed(3)} pos=${d.last[0].toFixed(2)},${d.last[1].toFixed(2)},${d.last[2].toFixed(2)}`,
      );
      d.n = 0;
      d.maxStep = 0;
      d.path = 0;
    }, POSE_DIAG_MS);
    const sub = AppState.addEventListener("change", (s) => addLog(`AppState ${s}`));
    isARSupportedOnDevice()
      .then((r) => setArSupport(r.isARSupported ? "SUPPORTED" : "NOT SUPPORTED"))
      .catch((e: unknown) => setArSupport(`NOT SUPPORTED (${String(e instanceof Error ? e.message : e)})`));
    return () => {
      clearInterval(diagTimer);
      clearInterval(motionTimer);
      accelSub.remove();
      gyroSub.remove();
      sub.remove();
      vioSink.onPose = undefined;
      vioSink.onTracking = undefined;
    };
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocGranted(status === "granted");
      if (status !== "granted") return addLog("Location permission denied");
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const t = loc.timestamp;
          if (lastFixMs.current !== null && t - lastFixMs.current > FIX_GAP_LOG_MS) {
            addLog(`GPS fix gap ${Math.round((t - lastFixMs.current) / 1000)} s`);
          }
          lastFixMs.current = t;
          motion.current = setGpsSpeed(motion.current, Date.now(), loc.coords.speed);
          setGps((s) =>
            addGpsFix(
              s,
              { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyM: loc.coords.accuracy, timestampMs: t, speedMps: loc.coords.speed },
              MAX_ACCURACY_M,
            ),
          );
        },
      );
    })().catch((e: unknown) => addLog(`Location error: ${String(e)}`));
    return () => sub?.remove();
  }, []);

  const distanceMethod: "VIO_DISTANCE" | "GPS_DISTANCE" = mode === "VIO" ? "VIO_DISTANCE" : "GPS_DISTANCE";
  // VIO: straight-line displacement from the last capture point, so panning in place cannot trigger.
  // GPS: filtered path length since the last capture.
  // GPS (vehicle / PUV mode): speed-integrated distance since the last capture, projected briefly
  // between 1 Hz fixes so the trigger does not wait for the next fix.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const gpsLiveM = gpsSpeedLiveM(gps, nowTick);
  const sinceCaptureM = mode === "VIO" ? vioSinceCaptureM(vio) : Math.max(0, gpsLiveM - lastGpsCaptureAt.current);

  async function takeImage(): Promise<Shot> {
    if (mode === "VIO") {
      if (!vioSink.takeFrame) throw new Error("AR view not ready");
      const r = await vioSink.takeFrame(`astig_spike_${Date.now()}`);
      if (!r?.success || !r.url) throw new Error(`AR frame not saved (errorCode ${r?.errorCode ?? "unknown"})`);
      const uri = r.url.startsWith("file://") ? r.url : `file://${r.url}`;
      return { uri, ...(await imageSize(uri)), source: "AR_FRAME" };
    }
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
    if (!photo) throw new Error("camera not ready");
    return { uri: photo.uri, width: photo.width, height: photo.height, source: "CAMERA" };
  }

  /** One capture attempt. A failure is logged as a failure; it never becomes a capture record. */
  async function capture(samplingMethod: SamplingMethod, distanceFromPreviousM: number | null) {
    if (busy.current) return;
    busy.current = true;
    try {
      const fix = gpsRef.current.last;
      const built = buildCaptureRequest({ sequenceNumber: sequence.current, capturedAt: new Date(), fix, samplingMethod, distanceFromPreviousM });
      if (!built.ok) {
        setFailures((f) => f + 1);
        return addLog(`CAPTURE_FAILED ${built.reason} samplingMethod=${samplingMethod}`);
      }
      const shot = await takeImage();
      sequence.current += 1;
      const losses = vioRef.current.trackingLosses;
      // `spike` holds what the draft contract has no field for (see README "Contract gaps").
      const spike = {
        imageSource: shot.source,
        imagePx: `${shot.width}x${shot.height}`,
        vioTrackingLossesSincePrevious: samplingMethod === "VIO_DISTANCE" ? losses - lossesAtLastCapture.current : null,
        intervalM: samplingMethod === "MANUAL" ? null : Number(intervalM),
      };
      lossesAtLastCapture.current = losses;
      setCaptures((c) => c + 1);
      setLastShot({ ...shot, label: `#${built.request.sequenceNumber} ${samplingMethod}` });
      addLog(`CAPTURE ${JSON.stringify({ ...built.request, spike })}`);
    } catch (e) {
      setFailures((f) => f + 1);
      addLog(`CAPTURE_FAILED IMAGE_FAILED samplingMethod=${samplingMethod} ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      busy.current = false;
    }
  }

  // Distance-sampled trigger: fires when the active method's total has advanced by the interval.
  // It never fires on a timer. While VIO tracking is lost the total does not advance, so nothing fires.
  useEffect(() => {
    if (!auto) return;
    const interval = Number(intervalM);
    if (!(interval > 0)) return;
    if (shouldCapture(sinceCaptureM, 0, interval)) {
      if (distanceMethod === "VIO_DISTANCE") setVio(markVioCapture);
      else lastGpsCaptureAt.current = gpsSpeedLiveM(gpsRef.current, Date.now());
      void capture(distanceMethod, sinceCaptureM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, intervalM, distanceMethod, sinceCaptureM]);

  const toggleAuto = () => {
    const next = !auto;
    if (next) {
      // Start counting from here, so the first capture comes one interval after switching on.
      setVio(markVioCapture);
      lastGpsCaptureAt.current = gpsSpeedLiveM(gpsRef.current, Date.now());
      lossesAtLastCapture.current = vioRef.current.trackingLosses;
    }
    setAuto(next);
    addLog(`Auto-capture ${next ? `ON every ${intervalM} m by ${distanceMethod}` : "OFF"}`);
  };

  const reset = () => {
    setGps(initialGpsState);
    setVio((s) => ({ ...initialVioState, tracking: s.tracking }));
    lastGpsCaptureAt.current = 0;
    lossesAtLastCapture.current = 0;
    sequence.current = 0;
    setCaptures(0);
    setFailures(0);
    addLog("Distances reset (start of measured walk)");
  };

  const report = () => {
    const ref = Number(referenceM);
    const err = (m: number) => (ref > 0 ? `${percentError(m, ref).toFixed(1)}%` : "n/a");
    const summary = {
      reference_m: ref,
      GPS_DISTANCE_raw_m: +gps.rawM.toFixed(2),
      GPS_DISTANCE_raw_error: err(gps.rawM),
      GPS_DISTANCE_filtered_m: +gps.filteredM.toFixed(2),
      GPS_DISTANCE_filtered_error: err(gps.filteredM),
      GPS_DISTANCE_speed_m: +gps.speedM.toFixed(2),
      GPS_DISTANCE_speed_error: err(gps.speedM),
      gps_speed_now_mps: gps.last?.speedMps ?? null,
      gps_speed_gap_s: +gps.speedGapS.toFixed(1),
      gps_fixes_without_speed: gps.fixesWithoutSpeed,
      gps_fixes: gps.fixes,
      gps_rejected_fixes: gps.rejectedFixes,
      gps_last_accuracy_m: gps.last?.accuracyM ?? null,
      VIO_DISTANCE_net_m: mode === "VIO" ? +vioNetFromStartM(vio).toFixed(2) : null,
      VIO_DISTANCE_net_error: mode === "VIO" ? err(vioNetFromStartM(vio)) : "not run (VIO mode off)",
      VIO_DISTANCE_stepped_m: mode === "VIO" ? +vio.steppedM.toFixed(2) : null,
      VIO_DISTANCE_stepped_error: mode === "VIO" ? err(vio.steppedM) : "not run (VIO mode off)",
      VIO_DISTANCE_per_update_m: mode === "VIO" ? +vio.horizontalM.toFixed(2) : null,
      VIO_DISTANCE_per_update_error: mode === "VIO" ? err(vio.horizontalM) : "not run (VIO mode off)",
      vio_tracking_losses: vio.trackingLosses,
      vio_rejected_jumps: vio.rejectedJumps,
      motion_gate: gateOn ? "on" : "off",
      vio_gated_updates: vio.gatedUpdates,
      vio_max_speed_mps: Number(maxSpeed) > 0 ? Number(maxSpeed) : "off",
      ar_support: arSupport,
      auto_capture: auto ? `every ${intervalM} m by ${distanceMethod}` : "off",
      captures,
      capture_failures: failures,
      expected_auto_captures_for_reference: auto && Number(intervalM) > 0 && ref > 0 ? Math.floor(ref / Number(intervalM)) : null,
    };
    addLog(`REPORT ${JSON.stringify(summary)}`);
  };

  const fix = gps.last;
  const canCapture = mode === "VIO" ? vio.tracking === "NORMAL" : !!camPerm?.granted;
  return (
    <View style={{ flex: 1, paddingTop: 40 }}>
      <View style={{ height: 300 }}>
        {mode === "CAMERA" ? (
          camPerm?.granted ? (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          ) : (
            <Button title="Grant camera permission" onPress={() => void requestCamPerm()} />
          )
        ) : (
          <ViroARSceneNavigator initialScene={{ scene: VioScene as () => React.JSX.Element }} autofocus worldAlignment="Gravity" style={{ flex: 1 }} />
        )}
      </View>
      <ScrollView style={{ flex: 1, padding: 8 }}>
        <Text>SPIKE build. Mode: {mode === "CAMERA" ? "Camera + GPS (vehicle / PUV); auto-capture uses GPS speed distance" : "AR (VIO) + GPS; images are AR-view frames"}</Text>
        <Text>ARCore support: {arSupport}</Text>
        <Text>Location permission: {locGranted === null ? "pending" : locGranted ? "granted" : "DENIED"}</Text>
        <Text>
          Fix: {fix ? `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}` : "none"} · reported accuracy:{" "}
          {fix ? (fix.accuracyM === null ? "not reported" : `±${fix.accuracyM.toFixed(1)} m`) : "-"}
        </Text>
        <Text>GPS_DISTANCE raw: {gps.rawM.toFixed(1)} m (all {gps.fixes} fixes)</Text>
        <Text>
          GPS_DISTANCE filtered: {gps.filteredM.toFixed(1)} m (accuracy ≤ {MAX_ACCURACY_M} m; {gps.rejectedFixes} rejected)
        </Text>
        <Text>
          GPS_DISTANCE by speed (vehicle): {gps.speedM.toFixed(1)} m · speed now{" "}
          {typeof gps.last?.speedMps === "number" && gps.last.speedMps >= 0 ? `${gps.last.speedMps.toFixed(1)} m/s (${(gps.last.speedMps * 3.6).toFixed(0)} km/h)` : "not reported"} · counts
          above {DEFAULT_GPS_SPEED_CONFIG.minSpeedMps} m/s · gaps {gps.speedGapS.toFixed(0)} s
        </Text>
        <Text>
          VIO_DISTANCE:{" "}
          {mode === "VIO"
            ? `${vioNetFromStartM(vio).toFixed(1)} m net straight-line · path ${vio.steppedM.toFixed(1)} m stepped, ${vio.horizontalM.toFixed(1)} m per-update · tracking ${vio.tracking} · losses ${vio.trackingLosses} · rejected leaps ${vio.rejectedJumps}`
            : "off"}
        </Text>
        <Text>
          Motion gate: {gateOn ? (motionView.verdict.moving ? `MOVING (${motionView.verdict.reason})` : `NOT MOVING (${motionView.verdict.reason})`) : "off"} · bounce{" "}
          {motionView.stdG === null ? "n/a" : `${motionView.stdG.toFixed(2)} g`} (≥ {DEFAULT_MOTION_CONFIG.minAccelStdG}) · turn{" "}
          {motionView.gyro === null ? "n/a" : `${motionView.gyro.toFixed(1)} rad/s`} (≤ {DEFAULT_MOTION_CONFIG.maxGyroRadS}) · ignored {vio.gatedUpdates}
        </Text>
        <Text>
          Auto-capture: {auto ? `ON, every ${intervalM} m by ${distanceMethod}` : "off"} · {sinceCaptureM.toFixed(1)} m since last capture · captures {captures} · failed {failures}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 }}>
          <Button title={mode === "CAMERA" ? "Switch to AR (VIO)" : "Switch to camera"} onPress={() => setMode(mode === "CAMERA" ? "VIO" : "CAMERA")} />
          <Button title={auto ? "Stop auto-capture" : "Start auto-capture"} onPress={toggleAuto} />
          <Button title="Capture (manual)" onPress={() => void capture("MANUAL", null)} disabled={!canCapture} />
          <Button title={gateOn ? "Motion gate: on" : "Motion gate: off"} onPress={() => setGateOn(!gateOn)} />
          <Button title="Reset distances" onPress={reset} />
          <Button title="Report" onPress={report} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text>Interval (m):</Text>
            <TextInput value={intervalM} onChangeText={setIntervalM} keyboardType="numeric" style={{ borderWidth: 1, padding: 4 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text>Max speed (m/s):</Text>
            <TextInput value={maxSpeed} onChangeText={setMaxSpeed} keyboardType="numeric" style={{ borderWidth: 1, padding: 4 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text>Reference (m):</Text>
            <TextInput value={referenceM} onChangeText={setReferenceM} keyboardType="numeric" style={{ borderWidth: 1, padding: 4 }} />
          </View>
        </View>
        {lastShot && (
          <View style={{ flexDirection: "row", gap: 8, marginVertical: 8, alignItems: "center" }}>
            <Image source={{ uri: lastShot.uri }} style={{ width: 120, height: 90, backgroundColor: "#000" }} resizeMode="contain" />
            <Text style={{ flex: 1 }}>
              Last capture {lastShot.label}: {lastShot.width}x{lastShot.height} px, {lastShot.source === "AR_FRAME" ? "AR-view frame" : "camera photo"}
            </Text>
          </View>
        )}
        {log.map((l, i) => (
          <Text key={i} style={{ fontSize: 11 }}>
            {l.at.slice(11, 19)} {l.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
