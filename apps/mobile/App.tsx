/**
 * ASTIG capture app: session setup -> active session, plus the team's diagnostics
 * screen behind a small entry on setup. Two screens, no navigation library.
 *
 * The session and capture queue are saved to the app's private storage after every change,
 * so a session survives rotation, backgrounding and an app restart. When an operator account
 * is signed in, captures upload to the ASTIG API in the background (src/useUploader.ts);
 * without one they wait on the phone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Camera } from "expo-camera";
import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import { fetch as expoFetch } from "expo/fetch";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { CognitoAuth } from "./src/api/auth";
import { AstigClient } from "./src/api/client";
import { ASTIG_DEV, TEAM_DEVICE_ID, TEAM_VEHICLE_ID } from "./src/api/config";
import { secureTokenStore } from "./src/api/tokenStore";
import { allGranted, type PermissionKind, type PermissionSnapshot } from "./src/permissions";
import { emptyPersisted, type AppData, type UploadSessionInfo } from "./src/persist";
import { addEntry, latestCaptured, latestFailure, markUploaded, queueCounts, type QueueEntry } from "./src/queue";
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
import { appendEntry, appendUploadMark, loadAll, saveState } from "./src/storage";
import { photoStats } from "./src/storageGuard";
import { theme } from "./src/theme";
import { localOnlyCount, uploadablePending, type UploadDeps } from "./src/upload";
import { prepareUploadImage } from "./src/uploadImage";
import { useAccount } from "./src/useAccount";
import { useUploader } from "./src/useUploader";
import { ActiveScreen } from "./src/screens/ActiveScreen";
import { DiagnosticsScreen } from "./src/screens/DiagnosticsScreen";
import { SetupScreen, type EndedSummary } from "./src/screens/SetupScreen";

/** Saved distance is refreshed at most this often while moving (each capture also saves). */
const DISTANCE_SAVE_MS = 15_000;
const PERF_TAG = "ASTIG_PERF";
/** expo/fetch sends file bodies natively (the upload PUT); its type differs only cosmetically from fetch. */
const nativeFetch = expoFetch as unknown as typeof fetch;

/** Record when a session ended locally, so the uploader reports it with PATCH /sessions/{id}. */
function withEnded(data: AppData): AppData {
  if (data.session.phase !== "ENDED") return data;
  const s = data.session.session;
  const info = data.uploadSessions[s.clientSessionId];
  if (!info || info.endedAt || !s.endedAt) return data;
  return { ...data, uploadSessions: { ...data.uploadSessions, [s.clientSessionId]: { ...info, endedAt: s.endedAt } } };
}

function KeepAwake() {
  useKeepAwake("astig-session");
  return null;
}

/** Read saved state once at launch. A session that was running when the app stopped is resumed, with the downtime recorded. */
function initialState(): { state: AppData; warning: string | null } {
  const now = new Date();
  const t0 = Date.now();
  const loaded = loadAll();
  const warnings = [...loaded.warnings];
  let state: AppData;
  if (loaded.status === "OK") {
    const s = loaded.data;
    const savedAt = new Date(s.savedAt);
    let session = resumeAfterRestart(s.session, savedAt, s.lastDistanceM, now);
    // The app stopped while a stop was in progress: finish it at the time it was last saved.
    if (session.phase === "STOPPING") session = finishStop(session, savedAt);
    state = withEnded({ ...s, session });
  } else {
    state = { ...emptyPersisted(now), queue: loaded.queue };
    if (loaded.status === "UNREADABLE") {
      const where = loaded.savedAside ? " The damaged file was kept for the team to inspect." : "";
      warnings.unshift(`The previous session could not be loaded (${loaded.error}).${where} New captures are saved normally.`);
    }
  }
  const gapInfo = state.session.phase === "IDLE" ? "none" : state.session.session.gaps.map((g) => `${g.reason}:${g.to ? Math.round((Date.parse(g.to) - Date.parse(g.from)) / 1000) : "open"}s`).join(",");
  console.log(`${PERF_TAG} load ms=${Date.now() - t0} records=${state.queue.length} gaps=${gapInfo}`);
  return { state, warning: warnings.length > 0 ? warnings.join(" ") : null };
}

const snapshot = (p: { granted: boolean; status: string; canAskAgain: boolean }): PermissionSnapshot => ({ granted: p.granted, status: p.status, canAskAgain: p.canAskAgain });

function Root() {
  const insets = useSafeAreaInsets();
  const [boot] = useState(initialState);
  const [state, setState] = useState<AppData>(boot.state);
  const [screen, setScreen] = useState<"MAIN" | "DIAGNOSTICS">("MAIN");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [camera, setCamera] = useState<PermissionSnapshot | null>(null);
  const [location, setLocation] = useState<PermissionSnapshot | null>(null);
  const lastDistance = useRef(boot.state.lastDistanceM);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Upload account and API client (deployment ids are not secrets; tokens live in the secure store).
  const auth = useMemo(() => new CognitoAuth({ region: ASTIG_DEV.cognitoRegion, clientId: ASTIG_DEV.cognitoClientId, store: secureTokenStore, fetchImpl: nativeFetch }), []);
  const account = useAccount(auth);
  const lostRef = useRef(account.lost);
  lostRef.current = account.lost;
  const uploadDeps = useMemo<UploadDeps>(
    () => ({
      client: new AstigClient({ baseUrl: ASTIG_DEV.baseUrl, getToken: () => auth.getAccessToken(), fetchImpl: nativeFetch, onUnauthenticated: () => lostRef.current() }),
      prepareImage: prepareUploadImage,
      deviceId: TEAM_DEVICE_ID,
      vehicleId: TEAM_VEHICLE_ID,
    }),
    [auth],
  );
  const upload = useUploader({
    enabled: account.state.status === "SIGNED_IN",
    queue: state.queue,
    sessions: state.uploadSessions,
    deps: uploadDeps,
    onUploaded: (entry, observationId, at) => {
      const mark = { kind: "UPLOADED" as const, clientObservationId: entry.request.clientObservationId, observationId, uploadedAt: at.toISOString() };
      try {
        appendUploadMark(mark);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      }
      setState((p) => ({ ...p, queue: markUploaded(p.queue, mark.clientObservationId, observationId, mark.uploadedAt) }));
    },
    onSession: (id, info) => setState((p) => ({ ...p, uploadSessions: { ...p.uploadSessions, [id]: info } })),
    onAuthLost: () => lostRef.current(),
  });

  /** Small state file only; capture records are appended to the journal in onEntry. */
  const persist = useCallback((s: AppData) => {
    try {
      const t0 = Date.now();
      const bytes = saveState({ ...s, savedAt: new Date().toISOString(), lastDistanceM: lastDistance.current });
      console.log(`${PERF_TAG} state_save ms=${Date.now() - t0} bytes=${bytes}`);
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
      console.log(`${PERF_TAG} appstate ${s}`);
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
      const next = startSession(base, config, new Date());
      // Every session started by this build may be uploaded (now, or once an account signs in).
      const uploadSessions =
        next.phase === "IDLE"
          ? p.uploadSessions
          : { ...p.uploadSessions, [next.session.clientSessionId]: { startedAt: next.session.startedAt, startLocation: null, endedAt: null, serverId: null, endReported: false } };
      return {
        ...p,
        session: next,
        uploadSessions,
        recentDeviceLabels: rememberLabel(p.recentDeviceLabels, config.deviceLabel),
        recentVehicleLabels: rememberLabel(p.recentVehicleLabels, config.vehicleLabel),
      };
    });
    return null;
  }

  const onEntry = useCallback((e: QueueEntry) => {
    // Write the record to the journal first; it is the durable copy. A refused write is shown, and the
    // record is still kept in memory so the counts on screen stay truthful for this run.
    try {
      const t0 = Date.now();
      appendEntry(e);
      console.log(`${PERF_TAG} journal_append ms=${Date.now() - t0} kind=${e.kind}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setState((p) => ({
      ...p,
      queue: addEntry(p.queue, e),
      session: e.kind === "CAPTURED" ? consumeSequence(p.session, e.request.sequenceNumber) : p.session,
    }));
  }, []);
  const onFix = useCallback((fix: { latitude: number; longitude: number }) => {
    if (stateRef.current.session.phase !== "IDLE" && stateRef.current.session.session.startLocation) return;
    setState((p) => {
      const session = setStartLocation(p.session, fix);
      if (session.phase === "IDLE") return { ...p, session };
      const id = session.session.clientSessionId;
      const info: UploadSessionInfo | undefined = p.uploadSessions[id];
      // The start location is sent once, at registration; it is fixed from then on.
      const uploadSessions = info && !info.startLocation && !info.serverId ? { ...p.uploadSessions, [id]: { ...info, startLocation: session.session.startLocation } } : p.uploadSessions;
      return { ...p, session, uploadSessions };
    });
  }, []);
  const onDistance = useCallback((m: number) => {
    lastDistance.current = m;
  }, []);

  if (screen === "DIAGNOSTICS" && !running) {
    return <DiagnosticsScreen onBack={() => setScreen("MAIN")} />;
  }

  // Edge-to-edge is on: keep content out from under the status bar, and in landscape out from
  // under the navigation bar on the side. The bottom inset is handled by each screen's footer.
  const safe = { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right };

  const banner = saveError ? (
    <View style={styles.saveError}>
      <Text style={styles.saveErrorText} accessibilityLiveRegion="assertive">
        Could not save to this phone: {saveError}. Captures from now on may be lost if the app closes.
      </Text>
    </View>
  ) : null;

  if (state.session.phase === "ACTIVE" || state.session.phase === "STOPPING") {
    const s = state.session.session;
    return (
      <View style={[styles.root, safe]}>
        <KeepAwake />
        {banner}
        <ActiveScreen
          session={s}
          phase={state.session.phase}
          counts={queueCounts(state.queue, s.clientSessionId)}
          photos={photoStats(state.queue, s.clientSessionId)}
          latest={latestCaptured(state.queue, s.clientSessionId)}
          latestFailure={latestFailure(state.queue, s.clientSessionId)}
          onEntry={onEntry}
          onFix={onFix}
          onDistance={onDistance}
          onStop={() => setState((p) => ({ ...p, session: beginStop(p.session) }))}
          onStopped={() => setState((p) => (p.session.phase === "STOPPING" ? withEnded({ ...p, session: finishStop(p.session, new Date()) }) : p))}
          upload={upload}
          signedIn={account.state.status === "SIGNED_IN"}
          topInset={0}
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
    ended = {
      elapsed: formatElapsed(elapsedMs(s, new Date())),
      captured: c.captured,
      failed: c.failed,
      waitingUpload: c.waitingUpload,
      uploaded: c.uploaded,
      uploadable: state.uploadSessions[s.clientSessionId] !== undefined,
      gaps: s.gaps.length,
    };
    last = s.config;
  }
  const all = queueCounts(state.queue);

  return (
    <View style={[styles.root, safe]}>
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
        account={account}
        upload={upload}
        uploadTotals={{
          uploaded: all.uploaded,
          waiting: uploadablePending(state.queue, state.uploadSessions).length,
          localOnly: localOnlyCount(state.queue, state.uploadSessions),
        }}
        topInset={0}
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
  saveError: { backgroundColor: theme.color.danger, paddingHorizontal: theme.space[4], paddingVertical: theme.space[2] },
  saveErrorText: { color: theme.color.textOnAccent, fontSize: theme.font.size.bodyMd, fontWeight: theme.font.weight.bold },
});
