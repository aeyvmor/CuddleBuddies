/**
 * ASTIG capture app: session setup -> active session, plus the team's diagnostics
 * screen behind a small entry on setup. Two screens, no navigation library.
 *
 * The session and capture queue are local and saved to the app's private storage
 * after every change, so a session survives rotation, backgrounding and an app
 * restart. Nothing is uploaded in this build.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Camera } from "expo-camera";
import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { allGranted, type PermissionKind, type PermissionSnapshot } from "./src/permissions";
import { emptyPersisted, type PersistedState } from "./src/persist";
import { addEntry, latestCaptured, latestFailure, queueCounts, type QueueEntry } from "./src/queue";
import {
  beginStop,
  consumeSequence,
  DEFAULT_INTERVAL_M,
  elapsedMs,
  finishStop,
  formatElapsed,
  markBackground,
  markForeground,
  rememberLabel,
  resetToIdle,
  resumeAfterRestart,
  setStartLocation,
  startSession,
  type SessionConfig,
} from "./src/session";
import { loadState, saveState } from "./src/storage";
import { theme } from "./src/theme";
import { ActiveScreen } from "./src/screens/ActiveScreen";
import { DiagnosticsScreen } from "./src/screens/DiagnosticsScreen";
import { SetupScreen, type EndedSummary } from "./src/screens/SetupScreen";

/** Saved distance is refreshed at most this often while moving (each capture also saves). */
const DISTANCE_SAVE_MS = 15_000;

function KeepAwake() {
  useKeepAwake("astig-session");
  return null;
}

/** Read saved state once at launch. A session that was running when the app stopped is resumed, with the downtime recorded. */
function initialState(): { state: PersistedState; warning: string | null } {
  const now = new Date();
  const loaded = loadState();
  if (loaded.status === "NONE") return { state: emptyPersisted(now), warning: null };
  if (loaded.status === "UNREADABLE") {
    const where = loaded.savedAside ? " The damaged file was kept for the team to inspect." : "";
    return { state: emptyPersisted(now), warning: `Previous sessions and captures could not be loaded (${loaded.error}).${where} New captures are saved normally.` };
  }
  const s = loaded.state;
  const savedAt = new Date(s.savedAt);
  let session = resumeAfterRestart(s.session, savedAt, s.lastDistanceM, now);
  // The app stopped while a stop was in progress: finish it at the time it was last saved.
  if (session.phase === "STOPPING") session = finishStop(session, savedAt);
  return { state: { ...s, session }, warning: null };
}

const snapshot = (p: { granted: boolean; status: string; canAskAgain: boolean }): PermissionSnapshot => ({ granted: p.granted, status: p.status, canAskAgain: p.canAskAgain });

function Root() {
  const insets = useSafeAreaInsets();
  const [boot] = useState(initialState);
  const [state, setState] = useState<PersistedState>(boot.state);
  const [screen, setScreen] = useState<"MAIN" | "DIAGNOSTICS">("MAIN");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [camera, setCamera] = useState<PermissionSnapshot | null>(null);
  const [location, setLocation] = useState<PermissionSnapshot | null>(null);
  const lastDistance = useRef(boot.state.lastDistanceM);
  const stateRef = useRef(state);
  stateRef.current = state;

  const persist = useCallback((s: PersistedState) => {
    try {
      saveState({ ...s, savedAt: new Date().toISOString(), lastDistanceM: lastDistance.current });
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Save after every state change.
  useEffect(() => persist(state), [state, persist]);

  const refreshPermissions = useCallback(async () => {
    const [c, l] = await Promise.all([Camera.getCameraPermissionsAsync(), Location.getForegroundPermissionsAsync()]);
    setCamera(snapshot(c));
    setLocation(snapshot(l));
  }, []);

  useEffect(() => {
    void refreshPermissions();
    const sub = AppState.addEventListener("change", (s) => {
      const now = new Date();
      if (s === "background") {
        setState((p) => ({ ...p, session: markBackground(p.session, now) }));
      } else if (s === "active") {
        setState((p) => ({ ...p, session: markForeground(p.session, now) }));
        void refreshPermissions(); // the operator may have changed them in Settings
      }
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  const phase = state.session.phase;
  const running = phase === "ACTIVE" || phase === "STOPPING";

  // Keep the saved distance roughly current while a session runs.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => persist(stateRef.current), DISTANCE_SAVE_MS);
    return () => clearInterval(t);
  }, [running, persist]);

  async function request(kind: PermissionKind): Promise<PermissionSnapshot> {
    const r = kind === "CAMERA" ? await Camera.requestCameraPermissionsAsync() : await Location.requestForegroundPermissionsAsync();
    const s = snapshot(r);
    if (kind === "CAMERA") setCamera(s);
    else setLocation(s);
    return s;
  }

  async function start(config: SessionConfig): Promise<string | null> {
    const c = camera?.granted ? camera : camera?.canAskAgain === false ? camera : await request("CAMERA");
    const l = location?.granted ? location : location?.canAskAgain === false ? location : await request("LOCATION");
    if (!allGranted(c, l)) return "A session needs camera and location. See Permissions above for how to allow them.";
    lastDistance.current = 0;
    setState((p) => {
      const base = p.session.phase === "ENDED" ? resetToIdle(p.session) : p.session;
      return {
        ...p,
        session: startSession(base, config, new Date()),
        recentDeviceLabels: rememberLabel(p.recentDeviceLabels, config.deviceLabel),
        recentVehicleLabels: rememberLabel(p.recentVehicleLabels, config.vehicleLabel),
      };
    });
    return null;
  }

  const onEntry = useCallback((e: QueueEntry) => {
    setState((p) => ({
      ...p,
      queue: addEntry(p.queue, e),
      session: e.kind === "CAPTURED" ? consumeSequence(p.session, e.request.sequenceNumber) : p.session,
    }));
  }, []);
  const onFix = useCallback((fix: { latitude: number; longitude: number }) => {
    if (stateRef.current.session.phase !== "IDLE" && stateRef.current.session.session.startLocation) return;
    setState((p) => ({ ...p, session: setStartLocation(p.session, fix) }));
  }, []);
  const onDistance = useCallback((m: number) => {
    lastDistance.current = m;
  }, []);

  if (screen === "DIAGNOSTICS" && !running) {
    return <DiagnosticsScreen onBack={() => setScreen("MAIN")} />;
  }

  const banner = saveError ? (
    <View style={[styles.saveError, { paddingTop: insets.top + theme.space[2] }]}>
      <Text style={styles.saveErrorText} accessibilityLiveRegion="assertive">
        Could not save to this phone: {saveError}. Captures from now on may be lost if the app closes.
      </Text>
    </View>
  ) : null;

  if (state.session.phase === "ACTIVE" || state.session.phase === "STOPPING") {
    const s = state.session.session;
    return (
      <View style={styles.root}>
        <KeepAwake />
        {banner}
        <ActiveScreen
          session={s}
          phase={state.session.phase}
          counts={queueCounts(state.queue, s.clientSessionId)}
          latest={latestCaptured(state.queue, s.clientSessionId)}
          latestFailure={latestFailure(state.queue, s.clientSessionId)}
          onEntry={onEntry}
          onFix={onFix}
          onDistance={onDistance}
          onStop={() => setState((p) => ({ ...p, session: beginStop(p.session) }))}
          onStopped={() => setState((p) => (p.session.phase === "STOPPING" ? { ...p, session: finishStop(p.session, new Date()) } : p))}
          topInset={saveError ? theme.space[2] : insets.top}
          bottomInset={insets.bottom}
        />
      </View>
    );
  }

  let ended: EndedSummary | null = null;
  let last: SessionConfig | null = null;
  if (state.session.phase === "ENDED") {
    const s = state.session.session;
    const c = queueCounts(state.queue, s.clientSessionId);
    ended = { elapsed: formatElapsed(elapsedMs(s, new Date())), captured: c.captured, failed: c.failed, waitingUpload: c.waitingUpload, gaps: s.gaps.length };
    last = s.config;
  }

  return (
    <View style={styles.root}>
      {banner}
      <SetupScreen
        initial={{
          deviceLabel: last?.deviceLabel ?? state.recentDeviceLabels[0] ?? "",
          vehicleLabel: last?.vehicleLabel ?? state.recentVehicleLabels[0] ?? "",
          intervalM: last?.intervalM ?? DEFAULT_INTERVAL_M,
          source: last?.source ?? null,
        }}
        recentDevices={state.recentDeviceLabels}
        recentVehicles={state.recentVehicleLabels}
        camera={camera}
        location={location}
        onRequestPermission={(k) => void request(k)}
        onOpenSettings={() => void Linking.openSettings()}
        onStart={start}
        onDiagnostics={() => setScreen("DIAGNOSTICS")}
        ended={ended}
        storageWarning={boot.warning}
        topInset={saveError ? theme.space[2] : insets.top}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Root />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.canvas },
  saveError: { backgroundColor: theme.color.danger, paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] },
  saveErrorText: { color: theme.color.textOnAccent, fontSize: theme.font.size.bodyMd, fontWeight: theme.font.weight.bold },
});
