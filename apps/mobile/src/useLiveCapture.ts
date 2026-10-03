/**
 * Device wiring for an active session: GPS, motion sensors (AR source only), the
 * distance trigger and the capture itself. Distance comes from the existing
 * accumulators (src/distance.ts) through src/trigger.ts; nothing here measures it
 * a second way. The 250 ms tick only re-evaluates the distance trigger between GPS
 * fixes (as the diagnostics screen does); it never captures on time.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Image } from "react-native";
import type { CameraView } from "expo-camera";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";
import { buildCaptureRequest, type SamplingMethod } from "./capture";
import { addGpsFix, addVioPose, initialGpsState, initialVioState, markVioCapture, setVioTracking, type GpsDistanceState, type VioDistanceState, type VioTracking } from "./distance";
import { addAccel, DEFAULT_MOTION_CONFIG, initialMotionState, judgeMotion, setGpsSpeed, setGyro } from "./motion";
import type { QueueEntry, StoredImage } from "./queue";
import { sessionVioSink } from "./screens/ArView";
import type { SessionRecord } from "./session";
import { SOURCES, samplingMethodFor } from "./sources";
import { keepImage } from "./storage";
import { checkTrigger, distanceView, freshFix, initialTrigger, type TriggerState } from "./trigger";

/** Same values as the diagnostics screen. */
const MAX_ACCURACY_M = 20;
/** Plausibility limit for AR position steps (walking test value; AR mode does not count vehicle speeds). */
const VIO_MAX_SPEED_MPS = 3;
const SENSOR_INTERVAL_MS = 50;
const TICK_MS = 250;

export interface LiveCapture {
  nowMs: number;
  gps: GpsDistanceState;
  vioTracking: VioTracking;
  /** Distance counted by the chosen source since the app last started (add session.distanceCarriedM for the total). */
  liveDistanceM: number | null;
  busy: boolean;
  locationError: string | null;
  cameraReady: boolean;
  setCameraReady: (ready: boolean) => void;
  captureNow: () => void;
}

const imageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));

export function useLiveCapture(opts: {
  session: SessionRecord;
  /** False while stopping: nothing new starts. */
  capturing: boolean;
  cameraRef: RefObject<CameraView | null>;
  onEntry: (entry: QueueEntry) => void;
  onFix: (fix: { latitude: number; longitude: number }) => void;
}): LiveCapture {
  const { session, capturing, cameraRef } = opts;
  const source = session.config.source;
  const info = SOURCES[source];

  const [gps, setGps] = useState<GpsDistanceState>(initialGpsState);
  const [vio, setVio] = useState<VioDistanceState>(initialVioState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const gpsRef = useRef(gps);
  gpsRef.current = gps;
  const vioRef = useRef(vio);
  vioRef.current = vio;
  const triggerRef = useRef<TriggerState>(initialTrigger);
  const busyRef = useRef(false);
  const seqRef = useRef(session.nextSequence);
  const motion = useRef(initialMotionState);
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  // GPS for every source: captures need a position, and GPS speed feeds the motion gate.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (loc) => {
      setLocationError(null);
      motion.current = setGpsSpeed(motion.current, Date.now(), loc.coords.speed);
      cb.current.onFix({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setGps((s) =>
        addGpsFix(
          s,
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyM: loc.coords.accuracy, timestampMs: loc.timestamp, speedMps: loc.coords.speed },
          MAX_ACCURACY_M,
        ),
      );
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch((e: unknown) => setLocationError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  // AR source only: motion sensors for the gate, and ARCore pose updates.
  useEffect(() => {
    if (source !== "AR_VIO") return;
    Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);
    const a = Accelerometer.addListener(({ x, y, z }) => {
      motion.current = addAccel(motion.current, Date.now(), x, y, z, DEFAULT_MOTION_CONFIG.windowMs);
    });
    const g = Gyroscope.addListener(({ x, y, z }) => {
      motion.current = setGyro(motion.current, Date.now(), x, y, z);
    });
    sessionVioSink.onTracking = (t) => setVio((s) => setVioTracking(s, t));
    sessionVioSink.onPose = ([x, y, z]) => {
      const tMs = Date.now();
      const moving = judgeMotion(motion.current, tMs).moving;
      setVio((s) => addVioPose(s, { x, y, z }, { tMs, maxSpeedMps: VIO_MAX_SPEED_MPS, moving }));
    };
    return () => {
      a.remove();
      g.remove();
      sessionVioSink.onPose = undefined;
      sessionVioSink.onTracking = undefined;
    };
  }, [source]);

  const takeImage = useCallback(async (): Promise<Omit<StoredImage, "uri"> & { uri: string }> => {
    if (info.image === "AR_FRAME") {
      if (!sessionVioSink.takeFrame) throw new Error("AR view not ready");
      const r = await sessionVioSink.takeFrame(`astig_${Date.now()}`);
      if (!r?.success || !r.url) throw new Error(`AR frame not saved (errorCode ${r?.errorCode ?? "unknown"})`);
      const uri = r.url.startsWith("file://") ? r.url : `file://${r.url}`;
      return { uri, ...(await imageSize(uri)), source: "AR_FRAME" };
    }
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
    if (!photo) throw new Error("camera not ready");
    return { uri: photo.uri, width: photo.width, height: photo.height, source: "CAMERA" };
  }, [cameraRef, info.image]);

  /** One attempt. A failure is recorded as a failure; it never becomes a capture. */
  const runCapture = useCallback(
    async (samplingMethod: SamplingMethod, distanceFromPreviousM: number | null) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const attemptedAt = new Date();
      const fail = (reason: "NO_LOCATION_FIX" | "IMAGE_FAILED" | "IMAGE_NOT_SAVED", detail: string | null) =>
        cb.current.onEntry({ kind: "FAILED", clientSessionId: session.clientSessionId, attemptedAt: attemptedAt.toISOString(), samplingMethod, reason, detail });
      try {
        const fix = freshFix(gpsRef.current.last, attemptedAt.getTime());
        const built = buildCaptureRequest({ sequenceNumber: seqRef.current, capturedAt: attemptedAt, fix, samplingMethod, distanceFromPreviousM });
        if (!built.ok) return fail(built.reason, null);
        let shot;
        try {
          shot = await takeImage();
        } catch (e) {
          return fail("IMAGE_FAILED", e instanceof Error ? e.message : String(e));
        }
        let uri: string;
        try {
          uri = keepImage(shot.uri, built.request.clientObservationId);
        } catch (e) {
          return fail("IMAGE_NOT_SAVED", e instanceof Error ? e.message : String(e));
        }
        seqRef.current = built.request.sequenceNumber + 1;
        cb.current.onEntry({
          kind: "CAPTURED",
          clientSessionId: session.clientSessionId,
          request: built.request,
          image: { uri, width: shot.width, height: shot.height, source: shot.source },
          upload: { state: "PENDING" },
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [session.clientSessionId, takeImage],
  );

  // Distance trigger. Skipped while a capture is running, so an interval is never consumed without a capture attempt.
  useEffect(() => {
    if (!capturing || !info.autoCapture || busyRef.current) return;
    const d = checkTrigger(source, session.config.intervalM, gpsRef.current, vioRef.current, triggerRef.current, nowMs);
    if (!d.fire) return;
    triggerRef.current = d.trigger;
    if (source === "AR_VIO") setVio(markVioCapture);
    void runCapture(samplingMethodFor(source, "DISTANCE"), d.distanceFromPreviousM);
  }, [nowMs, gps, vio, capturing, info.autoCapture, source, session.config.intervalM, runCapture]);

  const captureNow = useCallback(() => {
    if (!capturing) return;
    void runCapture(samplingMethodFor(source, "TAP"), null);
  }, [capturing, runCapture, source]);

  return {
    nowMs,
    gps,
    vioTracking: vio.tracking,
    liveDistanceM: distanceView(source, gps, vio, triggerRef.current, nowMs).totalM,
    busy,
    locationError,
    cameraReady,
    setCameraReady,
    captureNow,
  };
}
