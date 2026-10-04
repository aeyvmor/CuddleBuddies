/**
 * Session setup: device and vehicle labels, capture interval, distance source,
 * permissions, start. Thin: validation is in src/session.ts, permission wording in
 * src/permissions.ts, source wording in src/sources.ts.
 */
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { describePermission, type PermissionKind, type PermissionSnapshot } from "../permissions";
import { DEFAULT_INTERVAL_M, MAX_LABEL_LENGTH, stepInterval, validateSetup, type SessionConfig, type SetupField } from "../session";
import { SOURCE_ORDER, SOURCES, type DistanceSource } from "../sources";
import { theme } from "../theme";
import { Button, Card, Chip, Muted, SectionTitle } from "../ui";
import type { Account } from "../useAccount";
import type { UploadStatus } from "../useUploader";
import { AccountCard, type UploadTotals } from "./AccountCard";

const { color, space, radius, size, font } = theme;

export interface EndedSummary {
  elapsed: string;
  captured: number;
  failed: number;
  waitingUpload: number;
  uploaded: number;
  /** False for sessions from builds before the uploader (kept on the phone only). */
  uploadable: boolean;
  gaps: number;
}

interface Props {
  initial: { deviceLabel: string; vehicleLabel: string; intervalM: number; source: DistanceSource | null };
  recentDevices: string[];
  recentVehicles: string[];
  camera: PermissionSnapshot | null;
  location: PermissionSnapshot | null;
  onRequestPermission: (kind: PermissionKind) => void;
  onOpenSettings: () => void;
  /** Resolves to an error message when the session could not start. */
  onStart: (config: SessionConfig) => Promise<string | null>;
  onDiagnostics: () => void;
  ended: EndedSummary | null;
  /** Saved data that could not be read at launch; shown, never hidden. */
  storageWarning: string | null;
  account: Account;
  upload: UploadStatus;
  uploadTotals: UploadTotals;
  topInset: number;
  bottomInset: number;
}

function LabelField(props: { label: string; value: string; onChange: (v: string) => void; recent: string[]; error?: string; hint: string }) {
  return (
    <Card>
      <SectionTitle>{props.label}</SectionTitle>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        maxLength={MAX_LABEL_LENGTH}
        autoCapitalize="words"
        autoCorrect={false}
        placeholder={props.hint}
        placeholderTextColor={color.textMuted}
        accessibilityLabel={`${props.label} label`}
        accessibilityHint={props.error}
        style={[styles.input, props.error && styles.inputError]}
      />
      {props.recent.length > 0 && (
        <View style={styles.recentRow}>
          <Muted>Recent:</Muted>
          {props.recent.map((r) => (
            <Pressable
              key={r}
              onPress={() => props.onChange(r)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${props.label.toLowerCase()} ${r}`}
              style={({ pressed }) => [styles.recent, pressed && styles.recentPressed]}
            >
              <Text style={styles.recentText}>{r}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {props.error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {props.error}
        </Text>
      )}
      <Muted>A label for this session on this phone. It is not checked against any register.</Muted>
    </Card>
  );
}

function PermissionRow({ kind, p, onRequest, onSettings }: { kind: PermissionKind; p: PermissionSnapshot | null; onRequest: () => void; onSettings: () => void }) {
  const v = describePermission(kind, p);
  const tone = v.state === "GRANTED" ? "ok" : v.state === "NOT_ASKED" ? "neutral" : "danger";
  return (
    <View style={styles.permRow}>
      <Chip label={v.title} tone={tone} />
      <Muted>{v.body}</Muted>
      {v.state === "REFUSED" &&
        (v.fix === "ASK_AGAIN" ? (
          <Button kind="secondary" label="Ask again" accessibilityLabel={`Ask again for ${kind.toLowerCase()} permission`} onPress={onRequest} />
        ) : (
          <Button kind="secondary" label="Open Settings" accessibilityLabel="Open Android settings for this app" onPress={onSettings} />
        ))}
    </View>
  );
}

export function SetupScreen(props: Props) {
  const [deviceLabel, setDeviceLabel] = useState(props.initial.deviceLabel);
  const [vehicleLabel, setVehicleLabel] = useState(props.initial.vehicleLabel);
  const [intervalM, setIntervalM] = useState(String(props.initial.intervalM || DEFAULT_INTERVAL_M));
  const [source, setSource] = useState<DistanceSource | null>(props.initial.source);
  const [errors, setErrors] = useState<Partial<Record<SetupField, string>>>({});
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const needsInterval = source === null || SOURCES[source].autoCapture;

  async function start() {
    setStartError(null);
    const r = validateSetup({ deviceLabel, vehicleLabel, intervalM, source });
    if (!r.ok) {
      setErrors(r.errors);
      setStartError("Check the highlighted fields above.");
      return;
    }
    setErrors({});
    setStarting(true);
    try {
      setStartError(await props.onStart(r.config));
    } finally {
      setStarting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: props.topInset + space[4], paddingBottom: props.bottomInset + space[6] }]}>
      <View style={styles.header}>
        <Text style={styles.brand} accessibilityRole="header">
          ASTIG
        </Text>
        <Text style={styles.subtitle}>Start an inspection session</Text>
      </View>

      {props.storageWarning && (
        <Card tone="danger">
          <Chip label="Saved data could not be read" tone="danger" />
          <Muted>{props.storageWarning}</Muted>
        </Card>
      )}

      {props.ended && (
        <Card tone="mint">
          <Chip label="Last session ended" tone="neutral" />
          <Text style={styles.summary}>
            {props.ended.elapsed} · {props.ended.captured} captured · {props.ended.failed} failed
          </Text>
          <Muted>
            {props.ended.uploadable
              ? `${props.ended.uploaded} uploaded · ${props.ended.waitingUpload} waiting to upload.`
              : "Kept on this phone only (recorded before uploads were available)."}
            {props.ended.gaps > 0 ? ` Recording paused ${props.ended.gaps} time(s) while the app was not on screen.` : ""}
          </Muted>
        </Card>
      )}

      <AccountCard account={props.account} upload={props.upload} totals={props.uploadTotals} />

      <LabelField label="Device" value={deviceLabel} onChange={setDeviceLabel} recent={props.recentDevices} error={errors.deviceLabel} hint="For example: Phone A" />
      <LabelField label="Vehicle" value={vehicleLabel} onChange={setVehicleLabel} recent={props.recentVehicles} error={errors.vehicleLabel} hint="For example: Jeepney 12" />

      <Card>
        <SectionTitle>Capture interval</SectionTitle>
        {needsInterval ? (
          <>
            <View style={styles.stepper}>
              <Button kind="secondary" label="−" accessibilityLabel="Decrease interval by one metre" onPress={() => setIntervalM(stepInterval(intervalM, -1))} style={styles.stepButton} />
              <View style={styles.stepValue}>
                <TextInput
                  value={intervalM}
                  onChangeText={setIntervalM}
                  keyboardType="decimal-pad"
                  maxLength={4}
                  accessibilityLabel="Capture interval in metres"
                  accessibilityHint={errors.intervalM}
                  style={[styles.intervalInput, errors.intervalM && styles.inputError]}
                />
                <Text style={styles.unit}>metres</Text>
              </View>
              <Button kind="secondary" label="+" accessibilityLabel="Increase interval by one metre" onPress={() => setIntervalM(stepInterval(intervalM, 1))} style={styles.stepButton} />
            </View>
            {errors.intervalM && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {errors.intervalM}
              </Text>
            )}
            <Muted>A photo is taken each time the vehicle travels this far. Default {DEFAULT_INTERVAL_M} m.</Muted>
          </>
        ) : (
          <Muted>Not used: manual only takes a photo only when someone taps Capture.</Muted>
        )}
      </Card>

      <Card>
        <SectionTitle>Distance source</SectionTitle>
        <View accessibilityRole="radiogroup" style={styles.sources}>
          {SOURCE_ORDER.map((id) => {
            const s = SOURCES[id];
            const selected = source === id;
            return (
              <Pressable
                key={id}
                onPress={() => setSource(id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${s.title}${s.experimental ? ", experimental" : ""}. ${s.summary} ${s.testing}`}
                style={[styles.source, selected && styles.sourceSelected]}
              >
                <View style={styles.sourceHead}>
                  <View style={[styles.radio, selected && styles.radioOn]} importantForAccessibility="no">
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.sourceTitle}>{s.title}</Text>
                </View>
                <View style={styles.sourceChips}>
                  {selected && <Chip label="Selected" tone="ok" />}
                  {s.experimental && <Chip label="Experimental" tone="warning" />}
                </View>
                <Text style={styles.sourceBody}>{s.summary}</Text>
                <Muted>{s.testing}</Muted>
              </Pressable>
            );
          })}
        </View>
        {errors.source && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {errors.source}
          </Text>
        )}
      </Card>

      <Card>
        <SectionTitle>Permissions</SectionTitle>
        <PermissionRow kind="CAMERA" p={props.camera} onRequest={() => props.onRequestPermission("CAMERA")} onSettings={props.onOpenSettings} />
        <PermissionRow kind="LOCATION" p={props.location} onRequest={() => props.onRequestPermission("LOCATION")} onSettings={props.onOpenSettings} />
      </Card>

      {startError && (
        <Text style={styles.startError} accessibilityLiveRegion="assertive">
          {startError}
        </Text>
      )}
      <Button label={starting ? "Starting…" : "Start session"} onPress={() => void start()} disabled={starting} height={size.touchLarge} />

      <Button kind="text" label="Diagnostics" accessibilityLabel="Open diagnostics (team measurement screen)" onPress={props.onDiagnostics} style={styles.diagnostics} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { paddingHorizontal: space[4], gap: space[4] },
  header: { gap: space[1], marginBottom: space[1] },
  brand: { fontFamily: font.family, fontSize: font.size.headlineLg, fontWeight: font.weight.heavy, color: color.accent },
  subtitle: { fontFamily: font.family, fontSize: font.size.headlineSm, fontWeight: font.weight.semibold, color: color.text },
  summary: { fontFamily: font.family, fontSize: font.size.bodyLg, fontWeight: font.weight.bold, color: color.text },
  input: {
    minHeight: size.touch,
    borderWidth: size.borderControl,
    borderColor: color.controlBorder,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    fontFamily: font.family,
    fontSize: font.size.bodyLg,
    color: color.text,
    backgroundColor: color.surface,
  },
  inputError: { borderColor: color.danger, borderWidth: size.borderSelected },
  error: { fontFamily: font.family, fontSize: font.size.bodyMd, fontWeight: font.weight.semibold, color: color.danger },
  startError: { fontFamily: font.family, fontSize: font.size.bodyLg, fontWeight: font.weight.bold, color: color.danger, textAlign: "center" },
  recentRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  recent: {
    minHeight: size.touch,
    justifyContent: "center",
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
    borderWidth: size.borderHairline,
    borderColor: color.controlBorder,
  },
  recentPressed: { backgroundColor: color.surfaceMint },
  recentText: { fontFamily: font.family, fontSize: font.size.bodyMd, fontWeight: font.weight.semibold, color: color.text },
  stepper: { flexDirection: "row", alignItems: "center", gap: space[3] },
  stepButton: { width: size.touchLarge, minHeight: size.touchLarge, paddingHorizontal: space[0] },
  stepValue: { flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: space[2] },
  intervalInput: {
    minWidth: size.touchLarge,
    minHeight: size.touchLarge,
    textAlign: "center",
    borderWidth: size.borderControl,
    borderColor: color.controlBorder,
    borderRadius: radius.md,
    fontFamily: font.family,
    fontSize: font.size.displaySm,
    fontWeight: font.weight.heavy,
    color: color.text,
  },
  unit: { fontFamily: font.family, fontSize: font.size.bodyLg, fontWeight: font.weight.semibold, color: color.textMuted },
  sources: { gap: space[3] },
  source: { gap: space[2], padding: space[4], borderRadius: radius.md, borderWidth: size.borderControl, borderColor: color.border, backgroundColor: color.surface },
  sourceSelected: { borderColor: color.accent, borderWidth: size.borderSelected, backgroundColor: color.surfaceMint },
  sourceHead: { flexDirection: "row", alignItems: "center", gap: space[3] },
  radio: { width: space[5], height: space[5], borderRadius: radius.pill, borderWidth: size.borderSelected, borderColor: color.controlBorder, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: color.accent },
  radioDot: { width: space[3], height: space[3], borderRadius: radius.pill, backgroundColor: color.accent },
  sourceTitle: { flex: 1, fontFamily: font.family, fontSize: font.size.bodyLg, fontWeight: font.weight.bold, color: color.text },
  sourceChips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  sourceBody: { fontFamily: font.family, fontSize: font.size.bodyMd, lineHeight: font.size.bodyMd * font.lineHeight.body, color: color.text },
  permRow: { gap: space[2] },
  warningText: { color: color.warningFg },
  diagnostics: { alignSelf: "center", minHeight: size.touch },
});
