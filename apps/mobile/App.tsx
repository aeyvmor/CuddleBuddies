/**
 * THROWAWAY FEASIBILITY SPIKE. Not the capture app.
 * One screen: live GPS (fix, reported accuracy), accumulated distance per method,
 * and a capture button. No session, queue, upload, API or styling work.
 *
 * Distance methods are labelled exactly as the draft contract's samplingMethod
 * values: GPS_DISTANCE is never presented as VIO_DISTANCE.
 * Captured photos stay in the app cache; they are never uploaded or committed.
 */
import { useEffect, useRef, useState } from "react";
import { AppState, Button, ScrollView, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { ViroARScene, ViroARSceneNavigator, ViroTrackingStateConstants, isARSupportedOnDevice } from "@reactvision/react-viro";
import {
  addGpsFix,
  addVioPose,
  initialGpsState,
  initialVioState,
  percentError,
  setVioTracking,
  type GpsDistanceState,
  type VioDistanceState,
  type VioTracking,
} from "./src/distance";

const MAX_ACCURACY_M = 20;
const FIX_GAP_LOG_MS = 5_000;
const LOG_TAG = "ASTIG_SPIKE";

/** Module-level sink so the Viro scene (rendered by the navigator) can report to the screen. */
const vioSink: { onPose?: (p: [number, number, number]) => void; onTracking?: (t: VioTracking) => void } = {};

function VioScene() {
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

export default function App() {
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [locGranted, setLocGranted] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("CAMERA");
  const [arSupport, setArSupport] = useState<string>("not checked");
  const [gps, setGps] = useState<GpsDistanceState>(initialGpsState);
  const [vio, setVio] = useState<VioDistanceState>(initialVioState);
  const [referenceM, setReferenceM] = useState("50");
  const [log, setLog] = useState<LogLine[]>([]);
  const [captures, setCaptures] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const lastFixMs = useRef<number | null>(null);

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
    vioSink.onPose = ([x, y, z]) => setVio((s) => addVioPose(s, { x, y, z }));
    const sub = AppState.addEventListener("change", (s) => addLog(`AppState ${s}`));
    isARSupportedOnDevice()
      .then((r) => setArSupport(r.isARSupported ? "SUPPORTED" : "NOT SUPPORTED"))
      .catch((e: unknown) => setArSupport(`NOT SUPPORTED (${String(e instanceof Error ? e.message : e)})`));
    return () => {
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
          setGps((s) =>
            addGpsFix(
              s,
              { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyM: loc.coords.accuracy, timestampMs: t },
              MAX_ACCURACY_M,
            ),
          );
        },
      );
    })().catch((e: unknown) => addLog(`Location error: ${String(e)}`));
    return () => sub?.remove();
  }, []);

  const reset = () => {
    setGps(initialGpsState);
    setVio((s) => ({ ...initialVioState, tracking: s.tracking }));
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
      gps_fixes: gps.fixes,
      gps_rejected_fixes: gps.rejectedFixes,
      gps_last_accuracy_m: gps.last?.accuracyM ?? null,
      VIO_DISTANCE_stepped_m: mode === "VIO" ? +vio.steppedM.toFixed(2) : null,
      VIO_DISTANCE_stepped_error: mode === "VIO" ? err(vio.steppedM) : "not run (VIO mode off)",
      VIO_DISTANCE_per_update_m: mode === "VIO" ? +vio.horizontalM.toFixed(2) : null,
      VIO_DISTANCE_per_update_error: mode === "VIO" ? err(vio.horizontalM) : "not run (VIO mode off)",
      vio_tracking_losses: vio.trackingLosses,
      ar_support: arSupport,
    };
    addLog(`REPORT ${JSON.stringify(summary)}`);
  };

  const capture = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!photo) return addLog("Capture failed: camera not ready");
      setCaptures((c) => c + 1);
      addLog(
        `CAPTURE ${photo.width}x${photo.height} samplingMethod=GPS_DISTANCE horizontalAccuracyM=${gps.last?.accuracyM ?? "null"} at GPS ${gps.filteredM.toFixed(1)} m`,
      );
    } catch (e) {
      addLog(`Capture failed: ${String(e)}`);
    }
  };

  const fix = gps.last;
  return (
    <View style={{ flex: 1, paddingTop: 40 }}>
      <View style={{ height: 260 }}>
        {mode === "CAMERA" ? (
          camPerm?.granted ? (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          ) : (
            <Button title="Grant camera permission" onPress={() => void requestCamPerm()} />
          )
        ) : (
          <ViroARSceneNavigator initialScene={{ scene: VioScene }} autofocus worldAlignment="Gravity" style={{ flex: 1 }} />
        )}
      </View>
      <ScrollView style={{ flex: 1, padding: 8 }}>
        <Text>SPIKE build. Mode: {mode === "CAMERA" ? "Camera + GPS" : "AR (VIO) + GPS, camera capture unavailable"}</Text>
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
          VIO_DISTANCE:{" "}
          {mode === "VIO"
            ? `${vio.steppedM.toFixed(1)} m stepped (${vio.horizontalM.toFixed(1)} m per-update sum) · tracking ${vio.tracking} · losses ${vio.trackingLosses}`
            : "off"}
        </Text>
        <Text>Captures this run: {captures}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 }}>
          <Button title={mode === "CAMERA" ? "Switch to AR (VIO)" : "Switch to camera"} onPress={() => setMode(mode === "CAMERA" ? "VIO" : "CAMERA")} />
          <Button title="Capture" onPress={() => void capture()} disabled={mode !== "CAMERA" || !camPerm?.granted} />
          <Button title="Reset distances" onPress={reset} />
          <Button title="Report" onPress={report} />
        </View>
        <Text>Reference distance (m, tape-measured):</Text>
        <TextInput value={referenceM} onChangeText={setReferenceM} keyboardType="numeric" style={{ borderWidth: 1, padding: 4 }} />
        {log.map((l, i) => (
          <Text key={i} style={{ fontSize: 11 }}>
            {l.at.slice(11, 19)} {l.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
