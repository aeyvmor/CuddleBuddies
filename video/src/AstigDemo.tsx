import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

/**
 * ASTIG product video, 60 s. One continuous timeline (no hard cuts): shared elements morph between
 * scenes (live view -> full-screen drive -> captured frame -> phone tile -> cloud -> analysis), the
 * web part is a single browser window with a smooth camera (pan/zoom to real element rectangles
 * captured from the live app) and an eased cursor that clicks real buttons.
 */
export const FPS = 30;
export const TOTAL = 60 * FPS;

const FONT = '"SF Pro Display", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
const GREEN = "#00a650";
const INK = "#0f172a";
const W = 1920;

// ------------------------------------------------------------------ animation helpers
const easeIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
type Key = number[]; // [timeSeconds, ...values]
/** Keyframe track: eased (cubic in/out) between keys, held outside. Repeat a value to hold. */
function track(t: number, keys: Key[]): number[] {
  if (t <= keys[0]![0]!) return keys[0]!.slice(1);
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i]!;
    if (t <= k1[0]!) {
      const k0 = keys[i - 1]!;
      const span = k1[0]! - k0[0]!;
      const p = span <= 0 ? 1 : easeIO((t - k0[0]!) / span);
      return k0.slice(1).map((v, j) => v + (k1[j + 1]! - v) * p);
    }
  }
  return keys[keys.length - 1]!.slice(1);
}
const one = (t: number, keys: Key[]) => track(t, keys)[0]!;
/** 0 -> 1 -> 0 visibility window with eased edges. */
const win = (t: number, a: number, b: number, fade = 0.4) => one(t, [[a - fade, 0], [a, 1], [b, 1], [b + fade, 0]]);
const useT = () => useCurrentFrame() / FPS;

// ------------------------------------------------------------------ data from the live pipeline
// Real Gemini detection for the captured frame (Manila, Claveria St).
const BOX = [825, 535, 865, 585];
const JSON_LINES = [
  `"issueType": "BLOCKED_DRAIN",`,
  `"obstructionType": "DEBRIS",`,
  `"blockagePercent": 80,`,
  `"severityEstimate": "MODERATE",`,
  `"confidence": 0.85,`,
  `"regions": [{ "box": [${BOX.join(", ")}] }]`,
];

// ------------------------------------------------------------------ shared pieces
const Backdrop = ({ dark, opacity = 1 }: { dark?: boolean; opacity?: number }) => (
  <AbsoluteFill
    style={{
      opacity,
      background: dark
        ? "radial-gradient(ellipse at 50% 40%, #1b2433 0%, #05070b 70%)"
        : "radial-gradient(ellipse at 50% 25%, #ffffff 0%, #eef1f4 60%, #e2e7ed 100%)",
    }}
  />
);

/** Caption that cross-fades and drifts as its text changes. */
function Captions({ t, items, align = "left", dark }: { t: number; items: [number, number, string, string][]; align?: "left" | "top"; dark?: boolean }) {
  return (
    <>
      {items.map(([a, b, kicker, title]) => {
        const o = win(t, a, b, 0.35);
        if (o <= 0) return null;
        const y = (1 - o) * 18;
        const base: CSSProperties =
          align === "left"
            ? { left: 120, top: 300, width: 860, textAlign: "left" }
            : { left: 0, right: 0, top: 34, textAlign: "center" };
        return (
          <div key={a} style={{ position: "absolute", ...base, fontFamily: FONT, opacity: o, transform: `translateY(${y}px)` }}>
            <div style={{ fontSize: align === "left" ? 26 : 20, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: GREEN, marginBottom: align === "left" ? 12 : 4 }}>{kicker}</div>
            <div style={{ fontSize: align === "left" ? 64 : 46, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.05, color: dark ? "#fff" : INK }}>{title}</div>
          </div>
        );
      })}
    </>
  );
}

const Sfx = ({ at, src, volume = 0.6 }: { at: number; src: string; volume?: number }) => (
  <Sequence from={Math.round(at * FPS)} durationInFrames={FPS}>
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

const Chip = ({ text, o }: { text: string; o: number }) => (
  <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 600, color: INK, background: "#fff", borderRadius: 999, padding: "15px 28px", boxShadow: "0 12px 30px rgba(15,23,42,0.12)", opacity: o, transform: `translateY(${(1 - o) * 14}px) scale(${0.92 + o * 0.08})` }}>{text}</div>
);

// ------------------------------------------------------------------ phone geometry (canvas px)
const PHONE = { x: 1180, y: 90, w: 430, h: 900, pad: 16 };
const SCR = { x: PHONE.x + PHONE.pad, y: PHONE.y + PHONE.pad, w: PHONE.w - 2 * PHONE.pad, h: PHONE.h - 2 * PHONE.pad };
const REC_H = (SCR.w * 2772) / 1280; // recording screenshots at screen width
const SETUP_H = (SCR.w * 8275) / 1280;
// Tiles in the recording screen (normalized to rec2.jpg, measured from the screenshot).
const LIVE = { x: SCR.x + 0.074 * SCR.w, y: SCR.y + 0.539 * REC_H, w: 0.494 * SCR.w, h: 0.258 * REC_H };
const LATEST = { x: SCR.x + 0.5977 * SCR.w, y: SCR.y + 0.539 * REC_H, w: 0.3289 * SCR.w, h: 0.258 * REC_H };
const START_BTN_Y = 0.924 * SETUP_H; // "Start session" button in setup.jpg
const SETUP_SCROLL = START_BTN_Y - 700;

const Ripple = ({ t, at, x, y, size = 70 }: { t: number; at: number; x: number; y: number; size?: number }) => {
  const p = (t - at) / 0.5;
  if (p < 0 || p > 1) return null;
  return <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size, border: "3px solid rgba(0,166,80,0.9)", background: "rgba(0,166,80,0.18)", transform: `scale(${0.4 + p * 1.1})`, opacity: 1 - p, pointerEvents: "none" }} />;
};

// ------------------------------------------------------------------ act 1: phone, drive, capture, cloud, analysis
function PhoneAct() {
  const t = useT();
  if (t > 25) return null;
  const actO = one(t, [[2.6, 0], [3.0, 1], [23.7, 1], [24.4, 0]]);

  // Phone: in, zoom-away during the live-view morph, return, slide out for the upload.
  const [phO, phS, phX] = track(t, [
    [3.0, 0, 0.96, 0], [3.6, 1, 1, 0],
    [8.6, 1, 1, 0], [9.4, 0, 1.12, 0],
    [14.2, 0, 1.12, 0], [15.0, 1, 1, 0],
    [16.2, 1, 1, 0], [17.4, 0, 0.94, -420],
  ]);
  const setupScroll = one(t, [[3.6, 0], [5.6, SETUP_SCROLL]]);
  const scr = (a: number, b: number) => win(t, a, b, 0.3);

  // Hero: the shared element that morphs across scenes. [x, y, w, h, radius]
  const full = [0, 0, W, 1080, 0];
  const live = [LIVE.x, LIVE.y, LIVE.w, LIVE.h, 10];
  const latest = [LATEST.x, LATEST.y, LATEST.w, LATEST.h, 10];
  const cloudSmall = [1640, 432, 120, 68, 8];
  const analysis = [120, 300, 880, 495, 22];
  const [vx, vy, vw, vh, vr] = track(t, [[7.4, ...live], [8.6, ...live], [9.4, ...full], [13.6, ...full]]);
  const [cx, cy, cw, ch, cr] = track(t, [
    [13.6, ...full], [14.6, ...full], [15.6, ...latest], [16.2, ...latest],
    [17.0, 1480, 230, 200, 112, 12], [17.6, ...cloudSmall], [18.0, ...cloudSmall], [19.0, ...analysis], [24.0, ...analysis],
  ]);
  const flash = one(t, [[13.55, 0], [13.6, 1], [13.95, 0]]);
  const capturedHeroO = t >= 13.6 ? one(t, [[23.9, 1], [24.4, 0]]) : 0;

  // Analysis overlays relative to the hero rect.
  const scan = one(t, [[19.2, 0], [21.2, 100]]);
  const boxP = one(t, [[21.3, 0], [21.8, 1]]);
  const lines = Math.floor(one(t, [[19.6, 0], [22.6, JSON_LINES.length]]));
  const jsonO = one(t, [[18.8, 0], [19.4, 1], [23.9, 1], [24.4, 0]]);
  const cloudO = win(t, 16.0, 18.3, 0.4);
  const cloudDone = t > 17.6;

  const metres = Math.max(0, Math.floor((t - 9.4) * 3.4) * 7);

  return (
    <AbsoluteFill style={{ opacity: actO }}>
      <Backdrop />
      <Captions
        t={t}
        items={[
          [3.2, 6.1, "Start journey", "Start a session in seconds."],
          [6.4, 8.5, "Recording", "It samples the road by distance."],
          [16.4, 18.6, "Send to cloud", "Straight to private storage."],
          [19.0, 23.8, "Model analysis", "Gemini reads the scene."],
        ]}
      />

      {/* Phone with the real ASTIG mobile UI */}
      <div style={{ position: "absolute", left: PHONE.x, top: PHONE.y, width: PHONE.w, height: PHONE.h, opacity: phO, transform: `translateX(${phX}px) scale(${phS})`, transformOrigin: "50% 60%" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 64, background: "#0b0b0d", boxShadow: "0 50px 100px rgba(0,0,0,0.30), inset 0 0 0 2px #2a2a2e" }} />
        <div style={{ position: "absolute", left: PHONE.pad, top: PHONE.pad, width: SCR.w, height: SCR.h, borderRadius: 50, overflow: "hidden", background: "#fff" }}>
          <Img src={staticFile("mobile/setup.jpg")} style={{ position: "absolute", width: SCR.w, top: -setupScroll, opacity: scr(3.0, 6.0) }} />
          <Img src={staticFile("mobile/rec1.jpg")} style={{ position: "absolute", width: SCR.w, top: 0, opacity: scr(6.2, 7.3) }} />
          <Img src={staticFile("mobile/rec2.jpg")} style={{ position: "absolute", width: SCR.w, top: 0, opacity: scr(7.4, 30) }} />
          {/* Latest tile receives the capture */}
          {t >= 15.6 && (
            <div style={{ position: "absolute", left: LATEST.x - SCR.x, top: LATEST.y - SCR.y, width: LATEST.w, height: LATEST.h, borderRadius: 10, overflow: "hidden", opacity: one(t, [[15.6, 0], [15.75, 1]]) }}>
              <Img src={staticFile("capture.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", left: 6, bottom: 4, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#fff", textShadow: "0 1px 3px #000" }}>Latest</div>
            </div>
          )}
        </div>
        <Ripple t={t} at={5.8} x={PHONE.pad + SCR.w / 2} y={PHONE.pad + 700} />
      </div>

      {/* Hero A: live view -> full-screen drive */}
      {t >= 7.4 && t < 13.7 && (
        <div style={{ position: "absolute", left: vx, top: vy, width: vw, height: vh, borderRadius: vr, overflow: "hidden", boxShadow: vw < W ? "0 20px 60px rgba(0,0,0,0.35)" : "none" }}>
          <Sequence from={Math.round(7.4 * FPS)} layout="none">
            <OffthreadVideo src={staticFile("drive.mp4")} muted playbackRate={0.8} startFrom={0} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.45) 100%)", opacity: one(t, [[9.0, 0], [9.6, 1]]) }} />
          {t > 9.2 && (
            <>
              <div style={{ position: "absolute", left: 80, top: 70, fontFamily: FONT, color: "#fff", opacity: one(t, [[9.4, 0], [9.9, 1]]) }}>
                <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#86efac" }}>Drive POV · Binondo, Manila</div>
                <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1.4 }}>Just drive.</div>
              </div>
              <div style={{ position: "absolute", right: 80, top: 82, fontFamily: FONT, color: "#fff", display: "flex", alignItems: "center", gap: 14, background: "rgba(0,0,0,0.45)", padding: "14px 24px", borderRadius: 999, opacity: one(t, [[9.6, 0], [10.1, 1]]) }}>
                <span style={{ width: 16, height: 16, borderRadius: 8, background: "#ef4444", opacity: Math.floor(t * 2) % 2 ? 0.35 : 1 }} />
                <span style={{ fontSize: 28, fontWeight: 600 }}>Sampling every 7 m · {metres} m</span>
              </div>
              <div style={{ position: "absolute", left: 80, bottom: 46, fontFamily: FONT, fontSize: 20, color: "rgba(255,255,255,0.85)" }}>Footage: TFH TV, used with permission · faces &amp; plates blurred</div>
            </>
          )}
        </div>
      )}

      {/* Cloud */}
      {cloudO > 0 && (
        <div style={{ position: "absolute", left: 1580, top: 330, width: 240, opacity: cloudO, transform: `scale(${0.9 + cloudO * 0.1 + (cloudDone ? 0.04 : 0)})` }}>
          <svg viewBox="0 0 300 200" width="240" height="160">
            <path d="M80 170 Q20 170 25 120 Q30 80 75 82 Q85 30 145 32 Q200 34 210 82 Q275 78 280 128 Q282 170 225 170 Z" fill="#fff" stroke={cloudDone ? GREEN : "#94a3b8"} strokeWidth="10" strokeLinejoin="round" />
            <path d="M150 145 L150 85 M125 108 L150 83 L175 108" fill="none" stroke={cloudDone ? GREEN : "#94a3b8"} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 22, fontWeight: 600, color: "#475569" }}>Private S3 · ap-southeast-1</div>
        </div>
      )}

      {/* Hero B: captured frame -> phone tile -> cloud -> analysis */}
      {t >= 13.6 && capturedHeroO > 0 && (
        <div style={{ position: "absolute", left: cx, top: cy, width: cw, height: ch, borderRadius: cr, overflow: "hidden", opacity: capturedHeroO, boxShadow: cw < W ? "0 26px 60px rgba(15,23,42,0.30)" : "none" }}>
          <Img src={staticFile("capture.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {t > 19.0 && scan < 100 && <div style={{ position: "absolute", left: 0, right: 0, top: `${scan}%`, height: 6, background: "linear-gradient(90deg, transparent, #34d399, transparent)", boxShadow: "0 0 30px #34d399" }} />}
          {boxP > 0 && (
            <div style={{ position: "absolute", top: `${BOX[0]! / 10}%`, left: `${BOX[1]! / 10}%`, height: `${(BOX[2]! - BOX[0]!) / 10}%`, width: `${(BOX[3]! - BOX[1]!) / 10}%`, border: "4px solid #ef4444", borderRadius: 3, opacity: boxP, transform: `scale(${1.8 - boxP * 0.8})`, boxShadow: "0 0 0 2px rgba(0,0,0,0.5)" }}>
              <span style={{ position: "absolute", bottom: "100%", left: -4, background: "#dc2626", color: "#fff", fontFamily: FONT, fontSize: 18, fontWeight: 700, padding: "3px 8px", whiteSpace: "nowrap" }}>Blocked drain</span>
            </div>
          )}
        </div>
      )}
      <AbsoluteFill style={{ background: "#fff", opacity: flash, pointerEvents: "none" }} />
      {/* Captured pill */}
      {win(t, 13.7, 16.0, 0.3) > 0 && (
        <div style={{ position: "absolute", left: "50%", top: 64, transform: `translateX(-50%) scale(${0.9 + win(t, 13.7, 16.0, 0.3) * 0.1})`, opacity: win(t, 13.7, 16.0, 0.3), fontFamily: FONT, color: INK, background: "#fff", borderRadius: 999, padding: "14px 30px", fontSize: 30, fontWeight: 700, boxShadow: "0 16px 40px rgba(0,0,0,0.25)" }}>
          📸 Captured · 14.59923, 120.97705 · ±30 m
        </div>
      )}

      {/* Gemini JSON */}
      {jsonO > 0 && (
        <div style={{ position: "absolute", left: 1060, top: 300, width: 740, borderRadius: 22, background: INK, padding: "34px 38px", fontFamily: "Consolas, 'SF Mono', monospace", fontSize: 27, lineHeight: 1.65, color: "#e2e8f0", boxShadow: "0 30px 70px rgba(15,23,42,0.25)", opacity: jsonO, transform: `translateX(${(1 - jsonO) * 40}px)` }}>
          <div style={{ color: "#64748b" }}>{"{"}</div>
          {JSON_LINES.slice(0, lines).map((l, i) => (
            <div key={i} style={{ paddingLeft: 28, color: i === JSON_LINES.length - 1 ? "#fca5a5" : "#a7f3d0" }}>{l}</div>
          ))}
          <div style={{ color: "#64748b" }}>{lines >= JSON_LINES.length ? "}" : "▍"}</div>
          <div style={{ marginTop: 18, fontFamily: FONT, fontSize: 22, color: "#94a3b8" }}>Schema-validated · advisory · boxes are AI-estimated</div>
        </div>
      )}
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ act 2: web dashboard with camera + cursor
const BW = { x: 210, y: 150, w: 1500, h: 900, bar: 40 };
const CW = BW.w;
const CH = BW.h - BW.bar;
const S = 2091; // page scroll at which the dialogs were captured

const PAGES: [number, string][] = [
  [23.4, "web/signin.jpg"],
  [26.0, "web/signin-filled.jpg"],
  [27.5, "web/dash.jpg"],
  [30.8, "web/detail.jpg"],
  [37.6, "web/wo0.jpg"],
  [38.7, "web/wo1.jpg"],
  [42.6, "web/wo2.jpg"],
  [46.8, "web/wo3.jpg"],
];
// Camera [t, centerX, centerY, width] in page CSS px (from element rects captured on the live app).
const CAM: Key[] = [
  [24.5, 720, 512, 900], [27.5, 720, 512, 900], [28.3, 720, 413, 1440],
  [28.6, 720, 413, 1440], [29.8, 613, 752, 760], [31.2, 613, 752, 760],
  [32.6, 615, 1617, 760], [32.8, 615, 1617, 760], [33.8, 720, 1738, 380],
  [34.2, 720, 1738, 380], [35.4, 1180, 1651, 700], [35.8, 1180, 1651, 700],
  [36.8, 1180, 2525, 640], [39.7, 1180, 2525, 640], [40.4, 720, 2541, 1000],
  [42.6, 720, 2541, 1000], [43.4, 1180, 2560, 640], [44.1, 1180, 2560, 640],
  [44.6, 720, 2541, 1000], [46.6, 720, 2541, 1000], [47.2, 1180, 2560, 640],
  [48.0, 1180, 2503, 520], [49.0, 1180, 2503, 520], [50.5, 852, 5815, 1300],
];
const CURSOR: Key[] = [
  [24.9, 1000, 720], [25.6, 720, 449], [25.9, 720, 449], [26.6, 720, 594], [27.4, 720, 594],
  [28.6, 900, 620], [30.0, 543, 783], [30.9, 560, 800], [32.6, 820, 1680], [33.8, 765, 1760],
  [35.4, 1240, 1720], [36.8, 1260, 2560], [37.2, 1180, 2512], [37.6, 1180, 2512], [38.2, 1180, 2655],
  [38.7, 1180, 2655], [39.4, 1180, 2632], [39.9, 1180, 2632], [40.6, 720, 2555], [41.1, 720, 2555],
  [41.9, 874, 2751], [42.5, 874, 2751], [43.6, 1180, 2678], [44.3, 1180, 2678], [44.8, 720, 2518],
  [45.3, 720, 2518], [46.1, 869, 2713], [46.7, 869, 2713], [47.5, 1300, 2600], [49.0, 1300, 2600], [50.4, 1150, 5900],
];
const CLICKS = [25.8, 27.2, 30.6, 37.4, 38.5, 39.7, 40.9, 42.3, 44.1, 45.1, 46.5];
const DIALOGS = [
  { a: 39.9, b: 42.4, x: 448, y: S + 193, w: 544, h: 513, srcs: [[39.9, "web/d1a.jpg"], [41.3, "web/d1b.jpg"]] as [number, string][] },
  { a: 44.3, b: 46.6, x: 448, y: S + 233, w: 544, h: 434, srcs: [[44.3, "web/d2a.jpg"], [45.5, "web/d2b.jpg"]] as [number, string][] },
];

function Layered({ t, items, fade = 0.35, style }: { t: number; items: [number, string][]; fade?: number; style: CSSProperties }) {
  return (
    <>
      {items.map(([at, src], i) => {
        const next = items[i + 1]?.[0];
        if (t < at - 0.01 || (next !== undefined && t > next + fade + 0.05)) return null;
        return <Img key={src} src={staticFile(src)} style={{ ...style, opacity: one(t, [[at, i === 0 ? 1 : 0], [at + fade, 1]]) }} />;
      })}
    </>
  );
}

function WebAct() {
  const t = useT();
  if (t < 23.3 || t > 57) return null;
  const [cx, cy, cw] = track(t, CAM);
  const scale = CW / cw!;
  const camX = cx! - cw! / 2;
  const camY = cy! - CH / scale / 2;
  const toScreen = (px: number, py: number) => [BW.x + (px - camX) * scale, BW.y + BW.bar + (py - camY) * scale] as const;

  const winIn = one(t, [[23.5, 0], [24.4, 1]]);
  const [wS, wX] = track(t, [[50.5, 1, 0], [51.6, 0.66, 300], [55.4, 0.66, 300]]);
  const actO = one(t, [[55.4, 1], [56.2, 0]]);
  const curO = one(t, [[24.8, 0], [25.1, 1], [50.0, 1], [50.5, 0]]);
  const [mx, my] = track(t, CURSOR);
  const [sx, sy] = toScreen(mx!, my!);
  const press = CLICKS.some((c) => t >= c && t < c + 0.14);
  const check = one(t, [[47.9, 0], [48.4, 1]]);
  const chips = ["Offline-safe capture queue", "Duplicate-proof uploads", "Faces & plates blurred", "NCR city tagging", "Explicit failure states", "Field reports with photos", "QuickSight analytics"];

  return (
    <AbsoluteFill style={{ opacity: actO }}>
      <Backdrop opacity={one(t, [[23.4, 0], [24.0, 1]])} />
      <Captions
        t={t}
        align="top"
        items={[
          [24.6, 27.4, "Secure sign-in", "Officers sign in."],
          [27.7, 30.7, "Officer view", "It appears on the map."],
          [30.9, 33.9, "Issue dashboard", "Evidence, boxed by AI."],
          [34.1, 35.7, "Explainable priority", "Unknown inputs are never zero."],
          [35.9, 39.6, "Work order", "An officer decides."],
          [39.8, 43.3, "Field inspection", "Crews file what they find."],
          [43.5, 50.3, "Resolved", "Closed, with proof."],
        ]}
      />

      {/* Browser window */}
      <div style={{ position: "absolute", left: BW.x, top: BW.y, width: BW.w, height: BW.h, borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 40px 90px rgba(15,23,42,0.22), 0 0 0 1px rgba(15,23,42,0.06)", opacity: winIn, transform: `translate(${wX}px, ${(1 - winIn) * 50}px) scale(${(0.94 + winIn * 0.06) * wS!})`, transformOrigin: "50% 50%" }}>
        <div style={{ height: BW.bar, background: "#f3f4f6", display: "flex", alignItems: "center", gap: 8, paddingLeft: 16 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
          <span style={{ marginLeft: 18, fontFamily: FONT, fontSize: 17, color: "#6b7280" }}>astig-xi.vercel.app</span>
        </div>
        <div style={{ position: "absolute", left: 0, top: BW.bar, width: CW, height: CH, overflow: "hidden", background: "#f7f9fa" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1440, transformOrigin: "0 0", transform: `scale(${scale}) translate(${-camX}px, ${-camY}px)` }}>
            <Layered t={t} items={PAGES} style={{ position: "absolute", left: 0, top: 0, width: 1440 }} />
            {DIALOGS.map((d) => {
              const o = win(t, d.a, d.b, 0.3);
              if (o <= 0) return null;
              return (
                <div key={d.a}>
                  <div style={{ position: "absolute", left: 0, top: S - 400, width: 1440, height: 1700, background: "rgba(15,23,42,0.55)", opacity: o }} />
                  <div style={{ position: "absolute", left: d.x, top: d.y, width: d.w, height: d.h, borderRadius: 12, overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.3)", opacity: o, transform: `scale(${0.94 + o * 0.06})` }}>
                    <Layered t={t} items={d.srcs} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                  </div>
                </div>
              );
            })}
            {/* Red highlight around the AI box while zoomed in */}
            {win(t, 33.6, 34.4, 0.3) > 0 && <div style={{ position: "absolute", left: 672, top: 1706, width: 95, height: 65, borderRadius: 6, boxShadow: `0 0 0 ${4 + Math.sin(t * 8) * 2}px rgba(239,68,68,0.55)`, opacity: win(t, 33.6, 34.4, 0.3) }} />}
          </div>
        </div>
      </div>

      {/* Cursor (screen space, follows page coordinates through the camera) */}
      {curO > 0 && (
        <div style={{ position: "absolute", left: sx, top: sy, opacity: curO * winIn, transform: `scale(${press ? 0.86 : 1})`, transformOrigin: "4px 4px" }}>
          {CLICKS.map((c) => <Ripple key={c} t={t} at={c} x={4} y={4} size={56} />)}
          <svg width="34" height="40" viewBox="0 0 24 28" style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.35))" }}>
            <path d="M2 2 L2 22 L7.5 16.8 L11.2 25 L14.6 23.5 L10.9 15.4 L18.5 15.4 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Resolved check */}
      {check > 0 && t < 50.6 && (
        <div style={{ position: "absolute", left: 130, top: 560, width: 150, height: 150, borderRadius: 75, background: GREEN, display: "grid", placeItems: "center", opacity: check * one(t, [[49.6, 1], [50.4, 0]]), transform: `scale(${check})`, boxShadow: "0 20px 50px rgba(0,166,80,0.45)" }}>
          <svg width="80" height="80" viewBox="0 0 24 24">
            <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" strokeDashoffset={30 - check * 30} />
          </svg>
        </div>
      )}

      {/* Features */}
      {t > 51.0 && (
        <>
          <div style={{ position: "absolute", left: 110, top: 190, fontFamily: FONT, opacity: one(t, [[51.0, 0], [51.6, 1]]) }}>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: GREEN, marginBottom: 12 }}>And more</div>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1.4, color: INK }}>Built to be trusted.</div>
          </div>
          <div style={{ position: "absolute", left: 110, top: 360, width: 620, display: "flex", flexWrap: "wrap", gap: 16 }}>
            {chips.map((c, i) => <Chip key={c} text={c} o={one(t, [[51.6 + i * 0.35, 0], [52.0 + i * 0.35, 1]])} />)}
          </div>
        </>
      )}
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ intro / outro
function Intro() {
  const t = useT();
  if (t > 3.4) return null;
  const p = one(t, [[0.2, 0], [1.0, 1]]);
  const sub = one(t, [[0.8, 0], [1.5, 1]]);
  return (
    <AbsoluteFill style={{ opacity: one(t, [[2.6, 1], [3.2, 0]]) }}>
      <Backdrop dark />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff" }}>
        <div style={{ fontSize: 170, fontWeight: 800, letterSpacing: -6, opacity: p, transform: `scale(${0.92 + p * 0.08})` }}>
          ASTIG<span style={{ color: GREEN }}>.</span>
        </div>
        <div style={{ fontSize: 40, fontWeight: 500, color: "#cbd5e1", marginTop: 10, opacity: sub, transform: `translateY(${(1 - sub) * 14}px)` }}>Every trip, an inspection.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Outro() {
  const t = useT();
  if (t < 55.6) return null;
  const o = one(t, [[55.8, 0], [56.6, 1]]);
  const p = one(t, [[56.2, 0], [57.2, 1]]);
  const sub = one(t, [[56.9, 0], [57.6, 1]]);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Backdrop dark />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: -5, opacity: p, transform: `scale(${0.94 + p * 0.06})` }}>
          ASTIG<span style={{ color: GREEN }}>.</span>
        </div>
        <div style={{ fontSize: 36, color: "#cbd5e1", marginTop: 6, opacity: sub }}>Capture → Detect → Locate → Prioritize → Act</div>
        <div style={{ fontSize: 22, color: "#64748b", marginTop: 40, opacity: sub, maxWidth: 1300, lineHeight: 1.5 }}>
          AI is advisory; officers decide. Demo data labelled. Prototype risk weights, not flood prediction. Footage: TFH TV, used with permission.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ root
const typing = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i * 0.07);

export const AstigDemo = () => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Audio src={staticFile("pad.wav")} volume={0.35} />
      <Sequence from={0} durationInFrames={TOTAL} layout="none">
        <PhoneAct />
      </Sequence>
      <WebAct />
      <Intro />
      <Outro />

      <Sfx at={0.2} src="whoosh.wav" volume={0.35} />
      <Sfx at={3.1} src="pop.wav" volume={0.35} />
      <Sfx at={5.8} src="tick.wav" volume={0.9} />
      <Sfx at={6.2} src="pop.wav" volume={0.35} />
      <Sfx at={8.6} src="whoosh.wav" volume={0.45} />
      <Sfx at={13.6} src="shutter.wav" volume={0.9} />
      <Sfx at={15.6} src="pop.wav" volume={0.45} />
      <Sfx at={16.3} src="whoosh.wav" volume={0.45} />
      <Sfx at={17.6} src="ding.wav" volume={0.35} />
      <Sfx at={21.3} src="pop.wav" volume={0.5} />
      <Sfx at={24.1} src="whoosh.wav" volume={0.35} />
      {CLICKS.map((c) => <Sfx key={c} at={c} src="tick.wav" volume={0.8} />)}
      {[...typing(26.0, 7), ...typing(37.6, 5), ...typing(41.3, 8), ...typing(45.5, 7)].map((k) => <Sfx key={k} at={k} src="key.wav" volume={0.5} />)}
      <Sfx at={48.0} src="ding.wav" volume={0.55} />
      <Sfx at={50.5} src="whoosh.wav" volume={0.35} />
      <Sfx at={55.8} src="whoosh.wav" volume={0.4} />
    </AbsoluteFill>
  );
};
