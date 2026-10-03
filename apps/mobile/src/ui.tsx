/**
 * Small themed building blocks. Every colour and size comes from src/theme.ts.
 * Status is always words plus colour, never colour alone.
 */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type AccessibilityState, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { theme } from "./theme";

const { color, space, radius, size, font, elevation, opacity } = theme;

export function Card({ children, style, tone = "plain" }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: "plain" | "mint" | "warning" | "danger" }) {
  return <View style={[styles.card, tone !== "plain" && toneStyle[tone], style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[styles.muted, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export type ChipTone = "ok" | "neutral" | "warning" | "danger";

/** Dot + words. The dot is decorative; the words carry the state. */
export function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  const t = chipTone[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]} accessible accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} importantForAccessibility="no" />
      <Text style={[styles.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

type ButtonKind = "primary" | "danger" | "secondary" | "text";

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  /** Spoken label when it should say more than the visible text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const kind = props.kind ?? "primary";
  const state: AccessibilityState = { disabled: !!props.disabled };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={state}
      disabled={props.disabled}
      onPress={props.onPress}
      android_ripple={kind === "text" ? undefined : { color: color.scrim }}
      style={({ pressed }) => [
        styles.button,
        buttonKind[kind],
        { minHeight: props.height ?? size.touch },
        pressed && pressedKind[kind],
        props.disabled && styles.disabled,
        props.style,
      ]}
    >
      <Text style={[styles.buttonText, buttonTextKind[kind]]}>{props.label}</Text>
    </Pressable>
  );
}

/** Big number with a caption, for glanceable counters. */
export function Stat(props: { label: string; value: string; unit?: string; tone?: "plain" | "danger"; big?: boolean; spoken?: string }) {
  const danger = props.tone === "danger";
  return (
    <View style={styles.stat} accessible accessibilityLabel={props.spoken ?? `${props.label}: ${props.value}${props.unit ? ` ${props.unit}` : ""}`}>
      {/* One line: a label that does not fit shrinks a little instead of breaking mid-word (large font, narrow column). */}
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {props.label}
      </Text>
      <Text
        style={[props.big ? styles.statValueBig : styles.statValue, danger && styles.dangerText, styles.statValueBottom]}
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {props.value}
        {props.unit ? <Text style={styles.statUnit}> {props.unit}</Text> : null}
      </Text>
    </View>
  );
}

const chipTone: Record<ChipTone, { fg: string; bg: string; dot: string }> = {
  ok: { fg: color.statusOkFg, bg: color.statusOkBg, dot: color.brandDecor },
  neutral: { fg: color.statusNeutralFg, bg: color.statusNeutralBg, dot: color.statusNeutralFg },
  warning: { fg: color.warningFg, bg: color.warningBg, dot: color.warningFg },
  danger: { fg: color.danger, bg: color.dangerTint, dot: color.danger },
};

const toneStyle = StyleSheet.create({
  mint: { backgroundColor: color.surfaceMint, borderColor: color.surfaceMint },
  warning: { backgroundColor: color.warningBg, borderColor: color.warningBg },
  danger: { backgroundColor: color.dangerTint, borderColor: color.dangerTint },
});

const buttonKind = StyleSheet.create({
  primary: { backgroundColor: color.accent },
  danger: { backgroundColor: color.danger },
  secondary: { backgroundColor: color.surface, borderWidth: size.borderControl, borderColor: color.controlBorder },
  text: { backgroundColor: color.none, paddingHorizontal: space[2] },
});
const pressedKind = StyleSheet.create({
  primary: { backgroundColor: color.accentPressed },
  danger: { backgroundColor: color.dangerPressed },
  secondary: { backgroundColor: color.surfaceMuted },
  text: { opacity: opacity.pressedText },
});
const buttonTextKind = StyleSheet.create({
  primary: { color: color.textOnAccent },
  danger: { color: color.textOnAccent },
  secondary: { color: color.text },
  text: { color: color.accent, textDecorationLine: "underline" },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: size.borderHairline,
    borderColor: color.border,
    padding: space[4],
    gap: space[3],
    elevation: elevation.card,
  },
  sectionTitle: { fontFamily: font.family, fontSize: font.size.headlineSm, fontWeight: font.weight.bold, color: color.text },
  muted: { fontFamily: font.family, fontSize: font.size.bodySm, lineHeight: font.size.bodySm * font.lineHeight.body, color: color.textMuted },
  chip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", maxWidth: "100%", gap: space[2], paddingVertical: space[1], paddingHorizontal: space[3], borderRadius: radius.pill },
  dot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
  chipText: { flexShrink: 1, fontFamily: font.family, fontSize: font.size.labelSm, fontWeight: font.weight.bold, letterSpacing: font.tracking.chip },
  button: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: space[5], paddingVertical: space[2] },
  buttonText: { fontFamily: font.family, fontSize: font.size.bodyLg, fontWeight: font.weight.bold, textAlign: "center" },
  disabled: { opacity: opacity.disabled },
  stat: { flex: 1, gap: space[1] },
  statLabel: { fontFamily: font.family, fontSize: font.size.labelSm, fontWeight: font.weight.semibold, color: color.textMuted, textTransform: "uppercase", letterSpacing: font.tracking.label },
  statValue: { fontFamily: font.family, fontSize: font.size.displaySm, fontWeight: font.weight.heavy, color: color.text },
  statValueBig: { fontFamily: font.family, fontSize: font.size.displayLg, fontWeight: font.weight.heavy, color: color.text, lineHeight: font.size.displayLg * font.lineHeight.tight },
  statUnit: { fontSize: font.size.headlineMd, fontWeight: font.weight.bold, color: color.accent },
  statValueBottom: { marginTop: "auto" },
  dangerText: { color: color.danger },
});
