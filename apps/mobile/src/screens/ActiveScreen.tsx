/**
 * Active session: read at a glance from a mounted phone. Largest first: that it is
 * recording and for how long, distance, captures, failures, waiting for upload,
 * GPS, source. The operator should not need to touch it until Stop.
 * Thin: device wiring is in src/useLiveCapture.ts, rules in the pure modules.
 */
import { useEffect, useRef } from "react";
import { Alert, BackHandler, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CameraView } from "expo-camera";
import { FAILURE_TEXT, type CapturedEntry, type FailedEntry, type QueueCounts, type QueueEntry } from "../queue";
import { elapsedMs, formatDistance, formatElapsed, type SessionPhase, type SessionRecord } from "../session";
import { SOURCES } from "../sources";
import { formatBytes, formatCount, photosRemaining, storageLevel, type PhotoStats } from "../storageGuard";
import { theme } from "../theme";
import { Button, Card, Chip, Muted, Stat } from "../ui";
import { MAX_FIX_AGE_MS } from "../trigger";
import { useLiveCapture } from "../useLiveCapture";
import { ArView } from "./ArView";

const { color, space, radius, size, font } = theme;

interface Props {
  session: SessionRecord;
  phase: Extract<SessionPhase, "ACTIVE" | "STOPPING">;
  counts: QueueCounts;
  photos: PhotoStats;
  latest: CapturedEntry | null;
  latestFailure: FailedEntry | null;
  onEntry: (e: QueueEntry) => void;
  onFix: (fix: { latitude: number; longitude: number }) => void;
  /** Whole metres shown, for saving; called when the value changes. */
  onDistance: (m: number) => void;
  onStop: () => void;
  /** Called once stopping and no capture is in flight. */
  onStopped: () => void;
  topInset: number;
  bottomInset: number;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const clockSeconds = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function ActiveScreen(props: Props) {
  const { session, phase, counts } = props;
  const info = SOURCES[session.config.source];
  const cameraRef = useRef<CameraView>(null);
  const live = useLiveCapture({ session, capturing: phase === "ACTIVE", cameraRef, onEntry: props.onEntry, onFix: props.onFix });
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const distanceM = live.liveDistanceM === null ? null : session.distanceCarriedM + live.liveDistanceM;
  const shownM = distanceM === null ? null : Math.floor(distanceM);
  const onDistance = useRef(props.onDistance);
  onDistance.current = props.onDistance;
  useEffect(() => {
    if (shownM !== null) onDistance.current(shownM);
  }, [shownM]);

  const confirmStop = () => {
    if (phase !== "ACTIVE") return;
    Alert.alert(
      "Stop this session?",
      `Capturing stops now. The ${counts.captured} capture(s) stay on this phone.`,
      [
        { text: "Keep recording", style: "cancel" },
        { text: "Stop session", style: "destructive", onPress: props.onStop },
      ],
      { cancelable: true },
    );
  };

  // The hardware Back button must not end or leave a session silently.
  const stopRef = useRef(confirmStop);
  stopRef.current = confirmStop;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      stopRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Finish stopping only after an in-flight capture has settled, so it is recorded as captured or failed.
  const onStopped = useRef(props.onStopped);
  onStopped.current = props.onStopped;
  useEffect(() => {
    if (phase === "STOPPING" && !live.busy) onStopped.current();
  }, [phase, live.busy]);

  const fix = live.gps.last;
  const fixAgeS = fix ? (live.nowMs - fix.timestampMs) / 1000 : null;
  const hasFix = fix !== null && fixAgeS !== null && fixAgeS * 1000 <= MAX_FIX_AGE_MS;
  const speed = hasFix && typeof fix.speedMps === "number" && fix.speedMps >= 0 ? fix.speedMps : null;
  const dist = distanceM === null ? null : formatDistance(distanceM);
  const elapsed = formatElapsed(elapsedMs(session, new Date(live.nowMs)));
  const stopping = phase === "STOPPING";

  const status = (
    <Card style={styles.statusCard}>
      <View style={styles.statusRow}>
        <Chip label={stopping ? "STOPPING" : "RECORDING"} tone={stopping ? "neutral" : "ok"} />
        <Muted style={styles.labels} numberOfLines={1}>
          {session.config.vehicleLabel} · {session.config.deviceLabel}
        </Muted>
      </View>
      <View style={styles.elapsedRow}>
        <Text style={styles.elapsed} accessibilityLabel={`Session running for ${elapsed}, since ${clock(session.startedAt)}`} maxFontSizeMultiplier={1.3}>
          {elapsed}
        </Text>
        <Muted>since {clock(session.startedAt)}</Muted>
      </View>
    </Card>
  );

  const distance = (
    <Card>
      {dist ? (
        <Stat big label="Distance travelled" value={dist.value} unit={dist.unit} spoken={`Distance travelled ${dist.value} ${dist.unit === "m" ? "metres" : "kilometres"}`} />
      ) : (
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Distance travelled</Text>
          <Text style={styles.notMeasured}>Not measured (manual only)</Text>
        </View>
      )}
      {info.autoCapture && <Muted>A photo every {session.config.intervalM} m of distance travelled.</Muted>}
      {session.gaps.length > 0 && (
        <View style={styles.sourceRow}>
          <Chip label={`Paused ${session.gaps.length} ${session.gaps.length === 1 ? "time" : "times"}`} tone="warning" />
          <Muted>Not measured while off screen.</Muted>
        </View>
      )}
    </Card>
  );

  const counters = (
    <Card>
      <View style={styles.statsRow}>
        <Stat label="Captured" value={String(counts.captured)} />
        <Stat label="Failed" value={String(counts.failed)} tone={counts.failed > 0 ? "danger" : "plain"} />
        <Stat label="To upload" value={String(counts.waitingUpload)} spoken={`Waiting to upload: ${counts.waitingUpload}`} />
      </View>
      {props.latest && <Muted>Last photo {clockSeconds(props.latest.request.capturedAt)}</Muted>}
      {props.latestFailure && (
        <Text style={styles.failure} accessibilityLiveRegion="polite">
          Last failure {clockSeconds(props.latestFailure.attemptedAt)}: {FAILURE_TEXT[props.latestFailure.reason]}
        </Text>
      )}
      <Muted>Upload not connected in this build.</Muted>
    </Card>
  );

  const level = storageLevel(live.freeBytes);
  const remaining = photosRemaining(live.freeBytes, props.photos.averageBytes);
  const storageText =
    live.freeBytes === null
      ? "Free storage not reported"
      : `${formatBytes(live.freeBytes)} free${remaining !== null ? ` · room for about ${formatCount(remaining)} more photos` : ""}`;

  const gpsCard = (
    <Card>
      <View style={styles.statsRow}>
        <View style={styles.stat} accessible accessibilityLabel={hasFix ? `GPS reports plus or minus ${Math.round(fix.accuracyM ?? 0)} metres` : "No GPS fix"}>
          <Text style={styles.statLabel}>GPS</Text>
          {hasFix ? (
            <Text style={styles.value}>{fix.accuracyM === null ? "Accuracy not reported" : `±${Math.round(fix.accuracyM)} m`}</Text>
          ) : (
            <Chip label="No GPS fix" tone="warning" />
          )}
        </View>
        <View style={styles.stat} accessible accessibilityLabel={speed === null ? "Speed not reported" : `Speed ${Math.round(speed * 3.6)} kilometres per hour`}>
          <Text style={styles.statLabel}>Speed</Text>
          <Text style={styles.value}>{speed === null ? "Not reported" : `${Math.round(speed * 3.6)} km/h`}</Text>
        </View>
      </View>
      {live.locationError && <Text style={styles.failure}>Location stopped: {live.locationError}</Text>}
      <View style={styles.sourceRow}>
        <Text style={styles.sourceText}>Distance source: {info.activeLabel}</Text>
        {info.id === "AR_VIO" && <Chip label={live.vioTracking === "NORMAL" ? "AR tracking" : "AR tracking lost"} tone={live.vioTracking === "NORMAL" ? "ok" : "warning"} />}
      </View>
      <View style={styles.sourceRow}>
        {level === "FULL" && <Chip label="Storage full: photos stopped" tone="danger" />}
        {level === "LOW" && <Chip label="Phone storage low" tone="warning" />}
        <Muted>{storageText}</Muted>
      </View>
    </Card>
  );

  const media = (
    <Card style={styles.mediaCard}>
      <View style={styles.mediaRow}>
        <View style={styles.preview} accessible accessibilityLabel={info.image === "AR_FRAME" ? "AR camera view" : "Camera view"}>
          {info.image === "AR_FRAME" ? (
            <ArView style={styles.fill} />
          ) : (
            <CameraView ref={cameraRef} style={styles.fill} facing="back" onCameraReady={() => live.setCameraReady(true)} />
          )}
          <Text style={styles.mediaCaption}>Live view</Text>
        </View>
        <View style={styles.thumb} accessible accessibilityLabel={props.latest ? `Latest capture number ${props.latest.request.sequenceNumber + 1}` : "No capture yet"}>
          {props.latest ? (
            <Image source={{ uri: props.latest.image.uri }} style={styles.fill} resizeMode="cover" />
          ) : (
            <Text style={styles.thumbEmpty}>No capture yet</Text>
          )}
          <Text style={styles.mediaCaption}>{props.latest ? `Latest #${props.latest.request.sequenceNumber + 1} · ${clock(props.latest.request.capturedAt)}` : "Latest"}</Text>
        </View>
      </View>
    </Card>
  );

  // Portrait: one row under the cards. Landscape (a dashboard mount): a rail on the side, so the
  // cards keep the full height. Stop is the larger, red one and always asks before stopping.
  const actions = (
    <View style={landscape ? [styles.rail, { paddingBottom: props.bottomInset + space[3] }] : [styles.actions, { paddingBottom: props.bottomInset + space[3] }]}>
      <Button
        kind="secondary"
        label={live.busy ? "Capturing…" : "Capture now"}
        accessibilityLabel="Capture a photo now"
        accessibilityHint="Recorded as a manual capture"
        onPress={live.captureNow}
        disabled={stopping || live.busy || level === "FULL"}
        height={size.touchStop}
        style={landscape ? styles.railButton : styles.captureButton}
      />
      <Button
        kind="danger"
        label={stopping ? "Stopping…" : "Stop session"}
        accessibilityLabel="Stop session"
        accessibilityHint="Asks for confirmation"
        onPress={confirmStop}
        disabled={stopping}
        height={landscape ? size.touchStopRail : size.touchStop}
        style={landscape ? styles.railButton : styles.stopButton}
      />
    </View>
  );

  return (
    <View style={[styles.screen, landscape && styles.landscapeRow]}>
      <ScrollView style={styles.flex1} contentContainerStyle={[styles.content, { paddingTop: props.topInset + space[3] }]}>
        {landscape ? (
          // Pairs, read left to right then down: elapsed | distance, counts | GPS, then the views.
          <>
            <View style={styles.columns}>
              <View style={styles.column}>{status}</View>
              <View style={styles.column}>{distance}</View>
            </View>
            <View style={styles.columns}>
              <View style={styles.columnWide}>{counters}</View>
              <View style={styles.column}>{gpsCard}</View>
            </View>
            {media}
          </>
        ) : (
          <>
            {status}
            {distance}
            {counters}
            {gpsCard}
            {media}
          </>
        )}
      </ScrollView>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { paddingHorizontal: space[4], paddingBottom: space[4], gap: space[3] },
  columns: { flexDirection: "row", gap: space[3] },
  column: { flex: 1, gap: space[3] },
  /** Three counters need more width than two GPS values. */
  columnWide: { flex: 1.5, gap: space[3] },
  flex1: { flex: 1 },
  fill: StyleSheet.absoluteFill,
  statusCard: { gap: space[2] },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] },
  /** Moves under the chip when it does not fit beside it (narrow column, large font); one line at most. */
  labels: { flexGrow: 1, textAlign: "right" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: space[2] },
  elapsedRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: space[3] },
  elapsed: { fontFamily: font.family, fontSize: font.size.displayMd, fontWeight: font.weight.heavy, color: color.text, fontVariant: ["tabular-nums"] },
  stat: { flex: 1, gap: space[1] },
  statLabel: { fontFamily: font.family, fontSize: font.size.labelSm, fontWeight: font.weight.semibold, color: color.textMuted, textTransform: "uppercase", letterSpacing: font.tracking.label },
  value: { fontFamily: font.family, fontSize: font.size.headlineMd, fontWeight: font.weight.bold, color: color.text },
  notMeasured: { fontFamily: font.family, fontSize: font.size.headlineMd, fontWeight: font.weight.bold, color: color.textMuted },
  statsRow: { flexDirection: "row", gap: space[3] },
  failure: { fontFamily: font.family, fontSize: font.size.bodyMd, fontWeight: font.weight.bold, color: color.danger },
  sourceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  sourceText: { fontFamily: font.family, fontSize: font.size.bodyLg, fontWeight: font.weight.semibold, color: color.text },
  mediaCard: { padding: space[3] },
  mediaRow: { flexDirection: "row", gap: space[3] },
  preview: { flex: 3, height: size.previewH, borderRadius: radius.md, overflow: "hidden", backgroundColor: color.media, justifyContent: "flex-end" },
  thumb: { flex: 2, height: size.previewH, borderRadius: radius.md, overflow: "hidden", backgroundColor: color.media, justifyContent: "center" },
  thumbEmpty: { fontFamily: font.family, fontSize: font.size.bodyMd, color: color.textOnAccent, textAlign: "center" },
  mediaCaption: {
    position: "absolute",
    left: space[0],
    right: space[0],
    bottom: space[0],
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    backgroundColor: color.scrim,
    color: color.textOnAccent,
    fontFamily: font.family,
    fontSize: font.size.labelSm,
    fontWeight: font.weight.semibold,
  },
  actions: {
    flexDirection: "row",
    paddingHorizontal: space[4],
    paddingTop: space[3],
    gap: space[4],
    backgroundColor: color.surface,
    borderTopWidth: size.borderHairline,
    borderTopColor: color.border,
  },
  captureButton: { flex: 1, paddingHorizontal: space[2] },
  stopButton: { flex: 1.3, paddingHorizontal: space[2] },
  landscapeRow: { flex: 1, flexDirection: "row" },
  railButton: { paddingHorizontal: space[2] },
  /** Capture at the top, Stop at the bottom: far apart, so one is not pressed for the other. */
  rail: {
    width: size.rail,
    justifyContent: "space-between",
    paddingHorizontal: space[3],
    paddingTop: space[3],
    backgroundColor: color.surface,
    borderLeftWidth: size.borderHairline,
    borderLeftColor: color.border,
  },
});
