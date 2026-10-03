/**
 * ASTIG mobile theme: Civic Pulse direction (visual/civic_pulse_design_system/DESIGN.md).
 * A designer changes the look here; components read only from this file and contain
 * no literal colours or sizes.
 *
 * Names follow apps/web/src/styles/tokens.css where a token applies (`--color-canvas`
 * -> color.canvas, `--space-4` -> space[4], `--radius-card` -> radius.card).
 * Sizes are density-independent pixels (dp); font sizes scale with the system font setting.
 *
 * Departures from DESIGN.md, as on the web:
 * - Brand green #00B14F is ~2.8:1 on white, so it is decoration only. Text and filled
 *   buttons use the darker primary #006E2E (~6.4:1).
 * - Muted text is #475569 (DESIGN.md #64748B is ~4.3:1 on tinted surfaces).
 * Vehicle use: the type scale is larger than the web's, for reading at arm's length.
 *
 * Font: DESIGN.md specifies Plus Jakarta Sans. It is not bundled in this build, so text
 * uses the Android system font (Roboto), which is also the native convention.
 */

export const color = {
  canvas: "#f7f9fa",
  surface: "#ffffff",
  surfaceMuted: "#f1f5f9",
  surfaceMint: "#e8f8ee",
  border: "#e2e8f0",
  /** Form-control boundary, >= 3:1 against white. */
  controlBorder: "#7b8794",

  text: "#0f172a",
  textMuted: "#475569",
  textOnAccent: "#ffffff",

  accent: "#006e2e",
  accentPressed: "#005321",
  /** DESIGN.md primary-container. Decoration only (dots, icon fills), never text. */
  brandDecor: "#00b14f",
  focus: "#006e2e",

  danger: "#b91c1c",
  dangerPressed: "#7f1d1d",
  dangerTint: "#fee2e2",

  /** Caution: experimental source, open gaps, missing GPS. Always paired with words. */
  warningFg: "#92400e",
  warningBg: "#fef3c7",

  /** Recording / normal state chip. Always paired with words. */
  statusOkFg: "#166534",
  statusOkBg: "#dcfce7",

  /** Neutral chip (idle, ended, pending). */
  statusNeutralFg: "#334155",
  statusNeutralBg: "#e2e8f0",

  /** Behind camera previews and thumbnails. */
  media: "#0f172a",
  scrim: "rgba(15, 23, 42, 0.72)",
  none: "transparent",
} as const;

/** DESIGN.md spacing scale (web --space-1 .. --space-6). */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 } as const;

export const radius = { sm: 4, md: 12, card: 16, pill: 999 } as const;

export const size = {
  /** Android minimum touch target. */
  touch: 48,
  /** Primary actions on the active screen. */
  touchLarge: 64,
  /** The Stop button: the largest target on screen. */
  touchStop: 72,
  /** Stop in the landscape side rail, where height is free. */
  touchStopRail: 120,
  /** Width of the landscape button rail. */
  rail: 200,
  dot: 10,
  thumbnailW: 128,
  thumbnailH: 96,
  previewH: 220,
  borderHairline: 1,
  borderControl: 1.5,
  borderSelected: 2,
} as const;

export const font = {
  /** undefined = system font (Roboto on Android). */
  family: undefined as string | undefined,
  weight: { regular: "400", semibold: "600", bold: "700", heavy: "800" } as const,
  size: {
    labelSm: 14,
    bodySm: 15,
    bodyMd: 16,
    bodyLg: 18,
    headlineSm: 20,
    headlineMd: 24,
    headlineLg: 28,
    displaySm: 36,
    displayMd: 48,
    displayLg: 64,
  },
  lineHeight: { tight: 1.15, body: 1.4 },
  /** Letter spacing for uppercase labels and chips. */
  tracking: { chip: 0.4, label: 0.6 },
} as const;

export const opacity = { disabled: 0.5, pressedText: 0.7 } as const;

/** Android elevation levels (DESIGN.md Level 1 / Level 2). */
export const elevation = { card: 2, floating: 6 } as const;

export const theme = { color, space, radius, size, font, elevation, opacity };
export type Theme = typeof theme;
