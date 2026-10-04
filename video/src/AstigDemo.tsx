import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  getStaticFiles,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;
const s = (sec: number) => Math.round(sec * FPS);

// Scene timeline (seconds). Total 45 s.
const T = {
  intro: [0, 3],
  journey: [3, 7.5],
  drive: [7.5, 12.5],
  capture: [12.5, 15],
  upload: [15, 18.5],
  analysis: [18.5, 23.5],
  map: [23.5, 27.5],
  issue: [27.5, 32],
  workOrder: [32, 36.5],
  resolved: [36.5, 40],
  features: [40, 43],
  outro: [43, 45],
} as const;
export const TOTAL = s(45);

const FONT = '"SF Pro Display", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
const GREEN = "#00a650";
const INK = "#0f172a";
const ease = Easing.bezier(0.22, 1, 0.36, 1);

// Real detection from the live pipeline for this frame (Manila, Claveria St).
const DETECTION = {
  issueType: "BLOCKED_DRAIN",
  obstructionType: "DEBRIS",
  blockagePercent: 80,
  severityEstimate: "MODERATE",
  confidence: 0.85,
  regions: [{ label: "BLOCKED_DRAIN", box: [825, 535, 865, 585] }],
};
const BOX = DETECTION.regions[0]!.box;

const has = (name: string) => getStaticFiles().some((f) => f.name === name);

function useIn(delay = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.8 } });
}

function fadeOut(frame: number, dur: number, len = 8) {
  return interpolate(frame, [dur - len, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** Soft Apple-style backdrop. */
const Backdrop = ({ dark = false }: { dark?: boolean }) => (
  <AbsoluteFill
    style={{
      background: dark
        ? "radial-gradient(ellipse at 50% 40%, #1b2433 0%, #05070b 70%)"
        : "radial-gradient(ellipse at 50% 30%, #ffffff 0%, #eef1f4 60%, #e3e8ee 100%)",
    }}
  />
);

const Caption = ({ kicker, title, delay = 0, dark = false, style }: { kicker?: string; title: string; delay?: number; dark?: boolean; style?: CSSProperties }) => {
  const p = useIn(delay);
  return (
    <div style={{ position: "absolute", left: 120, top: 96, fontFamily: FONT, opacity: p, transform: `translateY(${(1 - p) * 24}px)`, ...style }}>
      {kicker && <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: GREEN, marginBottom: 10 }}>{kicker}</div>}
      <div style={{ fontSize: 58, fontWeight: 700, letterSpacing: -1.5, color: dark ? "#fff" : INK, lineHeight: 1.05, maxWidth: 640 }}>{title}</div>
    </div>
  );
};

/** Browser-style window holding an app screenshot, with optional slow pan/zoom. */
const Window = ({ src, delay = 0, zoom = [1, 1.06], origin = "50% 30%", style }: { src: string; delay?: number; zoom?: [number, number]; origin?: string; style?: CSSProperties }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = useIn(delay, 20);
  const z = interpolate(frame, [0, durationInFrames], zoom, { easing: ease });
  return (
    <div
      style={{
        position: "absolute",
        right: 70,
        top: 150,
        width: 1030,
        height: 700,
        borderRadius: 22,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 40px 90px rgba(15,23,42,0.22), 0 0 0 1px rgba(15,23,42,0.06)",
        opacity: p,
        transform: `translateY(${(1 - p) * 60}px) scale(${0.96 + p * 0.04})`,
        ...style,
      }}
    >
      <div style={{ height: 40, background: "#f3f4f6", display: "flex", alignItems: "center", gap: 8, paddingLeft: 16 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <span style={{ marginLeft: 18, fontFamily: FONT, fontSize: 17, color: "#6b7280" }}>astig-xi.vercel.app</span>
      </div>
      <div style={{ position: "absolute", inset: "40px 0 0 0", overflow: "hidden" }}>
        <Img src={staticFile(src)} style={{ width: "100%", transform: `scale(${z})`, transformOrigin: origin }} />
      </div>
    </div>
  );
};

/** Phone frame. Shows the team's real mobile screenshot when provided (public/mobile-*.png). */
const Phone = ({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) => {
  const p = useIn(delay, 16);
  return (
    <div
      style={{
        position: "absolute",
        width: 430,
        height: 900,
        borderRadius: 64,
        background: "#0b0b0d",
        padding: 16,
        boxShadow: "0 50px 100px rgba(0,0,0,0.35), inset 0 0 0 2px #2a2a2e",
        opacity: p,
        transform: `translateY(${(1 - p) * 80}px) rotate(${(1 - p) * -4}deg)`,
        ...style,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 50, overflow: "hidden", background: "#000" }}>{children}</div>
    </div>
  );
};

const Chip = ({ text, delay }: { text: string; delay: number }) => {
  const p = useIn(delay, 14);
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 30,
        fontWeight: 600,
        color: INK,
        background: "#fff",
        borderRadius: 999,
        padding: "16px 30px",
        boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
        opacity: p,
        transform: `scale(${0.8 + p * 0.2})`,
      }}
    >
      {text}
    </div>
  );
};

const Sfx = ({ at, src, volume = 0.6 }: { at: number; src: string; volume?: number }) => (
  <Sequence from={s(at)} durationInFrames={s(1.2)}>
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

const Scene = ({ t, children }: { t: readonly [number, number]; children: ReactNode }) => (
  <Sequence from={s(t[0])} durationInFrames={s(t[1] - t[0])}>
    {children}
  </Sequence>
);

// ------------------------------------------------------------------ scenes

const Intro = () => {
  const frame = useCurrentFrame();
  const p = useIn(6, 22);
  const sub = useIn(26);
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(3)) }}>
      <Backdrop dark />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff" }}>
        <div style={{ fontSize: 170, fontWeight: 800, letterSpacing: -6, opacity: p, transform: `scale(${0.9 + p * 0.1})` }}>
          ASTIG<span style={{ color: GREEN }}>.</span>
        </div>
        <div style={{ fontSize: 40, fontWeight: 500, color: "#cbd5e1", marginTop: 12, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)` }}>
          Every trip, an inspection.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Journey = () => {
  const frame = useCurrentFrame();
  const shots = ["mobile-1.png", "mobile-2.png", "mobile-3.png"].filter(has);
  const idx = shots.length ? Math.min(shots.length - 1, Math.floor(frame / s(1.5))) : -1;
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(4.5)) }}>
      <Backdrop />
      <Caption kicker="Start journey" title="Mount a phone. Start a session." />
      <div style={{ position: "absolute", left: 120, top: 320, fontFamily: FONT, fontSize: 32, color: "#475569", lineHeight: 1.5, maxWidth: 700, opacity: useIn(14) }}>
        The ASTIG app samples the street by distance travelled, queues captures offline, and uploads when it can.
      </div>
      <Phone delay={6} style={{ right: 260, top: 90 }}>
        {idx >= 0 ? (
          <Img src={staticFile(shots[idx]!)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <OffthreadVideo src={staticFile("drive.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </Phone>
    </AbsoluteFill>
  );
};

const Drive = () => {
  const frame = useCurrentFrame();
  const meters = Math.floor(frame / 9) * 7; // visual counter: one capture interval per ~0.3 s of footage
  const hud = useIn(10);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <OffthreadVideo src={staticFile("drive.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.45) 100%)" }} />
      <div style={{ position: "absolute", left: 80, top: 70, fontFamily: FONT, color: "#fff", opacity: hud }}>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#86efac" }}>Drive POV · Binondo, Manila</div>
        <div style={{ fontSize: 58, fontWeight: 700, letterSpacing: -1 }}>Just drive.</div>
      </div>
      <div style={{ position: "absolute", right: 80, top: 80, fontFamily: FONT, color: "#fff", display: "flex", alignItems: "center", gap: 14, opacity: hud, background: "rgba(0,0,0,0.45)", padding: "14px 24px", borderRadius: 999 }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: "#ef4444", opacity: frame % 30 < 18 ? 1 : 0.3 }} />
        <span style={{ fontSize: 28, fontWeight: 600 }}>Sampling every 7 m · {meters} m</span>
      </div>
      <div style={{ position: "absolute", left: 80, bottom: 50, fontFamily: FONT, fontSize: 20, color: "rgba(255,255,255,0.8)" }}>
        Footage: TFH TV, used with permission · faces &amp; plates blurred
      </div>
    </AbsoluteFill>
  );
};

const Capture = () => {
  const frame = useCurrentFrame();
  const flash = interpolate(frame, [0, 2, 10], [0, 1, 0], { extrapolateRight: "clamp" });
  const shrink = interpolate(frame, [s(1.4), s(2.5)], [1, 0.42], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const lift = interpolate(frame, [s(1.4), s(2.5)], [0, -40], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const tag = useIn(8, 14);
  return (
    <AbsoluteFill style={{ background: "#0b0d12" }}>
      <AbsoluteFill style={{ transform: `scale(${shrink}) translateY(${lift}px)`, borderRadius: (1 - shrink) * 60, overflow: "hidden", boxShadow: shrink < 1 ? "0 40px 80px rgba(0,0,0,0.5)" : "none" }}>
        <Img src={staticFile("capture.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      <div style={{ position: "absolute", left: "50%", top: 70, transform: `translateX(-50%) scale(${0.85 + tag * 0.15})`, opacity: tag, fontFamily: FONT, color: INK, background: "#fff", borderRadius: 999, padding: "14px 30px", fontSize: 30, fontWeight: 700, boxShadow: "0 16px 40px rgba(0,0,0,0.3)" }}>
        📸 Captured · 14.59923, 120.97705 · ±30 m
      </div>
    </AbsoluteFill>
  );
};

const Upload = () => {
  const frame = useCurrentFrame();
  const fly = interpolate(frame, [s(0.3), s(1.6)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const cloud = useIn(4, 14);
  const done = useIn(s(1.8), 12);
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(3.5)) }}>
      <Backdrop dark />
      <Caption kicker="Send to cloud" title="Straight to private storage." dark />
      <div style={{ position: "absolute", left: 120, top: 330, fontFamily: FONT, fontSize: 30, color: "#94a3b8", lineHeight: 1.5, maxWidth: 640 }}>
        Short-lived presigned upload to an encrypted S3 bucket. Retries never create duplicates.
      </div>
      <div
        style={{
          position: "absolute",
          left: interpolate(fly, [0, 1], [760, 1420]),
          top: interpolate(fly, [0, 1], [560, 360]) - Math.sin(fly * Math.PI) * 160,
          width: interpolate(fly, [0, 1], [420, 120]),
          aspectRatio: "16/9",
          borderRadius: 14,
          overflow: "hidden",
          opacity: 1 - interpolate(fly, [0.85, 1], [0, 1], { extrapolateLeft: "clamp" }),
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
      >
        <Img src={staticFile("capture.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ position: "absolute", left: 1350, top: 300, width: 300, height: 220, opacity: cloud, transform: `scale(${0.8 + cloud * 0.2 + done * 0.06})` }}>
        <svg viewBox="0 0 300 200" width="300" height="200">
          <path d="M80 170 Q20 170 25 120 Q30 80 75 82 Q85 30 145 32 Q200 34 210 82 Q275 78 280 128 Q282 170 225 170 Z" fill="none" stroke={done > 0.5 ? GREEN : "#e2e8f0"} strokeWidth="10" strokeLinejoin="round" />
          <path d="M150 145 L150 85 M125 108 L150 83 L175 108" fill="none" stroke={done > 0.5 ? GREEN : "#e2e8f0"} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 26, fontWeight: 600, color: "#e2e8f0", marginTop: 8 }}>AWS · ap-southeast-1</div>
      </div>
    </AbsoluteFill>
  );
};

const Analysis = () => {
  const frame = useCurrentFrame();
  const scan = interpolate(frame, [s(0.2), s(2.2)], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const box = useIn(s(2.2), 12);
  const lines = [
    `"issueType": "${DETECTION.issueType}",`,
    `"obstructionType": "${DETECTION.obstructionType}",`,
    `"blockagePercent": ${DETECTION.blockagePercent},`,
    `"severityEstimate": "${DETECTION.severityEstimate}",`,
    `"confidence": ${DETECTION.confidence},`,
    `"regions": [{ "box": [${BOX.join(", ")}] }]`,
  ];
  const shown = Math.floor(interpolate(frame, [s(0.6), s(3.4)], [0, lines.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(5)) }}>
      <Backdrop />
      <Caption kicker="Model analysis" title="Gemini reads the scene." />
      <div style={{ position: "absolute", left: 120, top: 300, width: 880, aspectRatio: "16/9", borderRadius: 22, overflow: "hidden", boxShadow: "0 30px 70px rgba(15,23,42,0.25)" }}>
        <Img src={staticFile("capture.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {scan < 100 && <div style={{ position: "absolute", left: 0, right: 0, top: `${scan}%`, height: 6, background: "linear-gradient(90deg, transparent, #34d399, transparent)", boxShadow: "0 0 30px #34d399" }} />}
        <div
          style={{
            position: "absolute",
            top: `${BOX[0] / 10}%`,
            left: `${BOX[1] / 10}%`,
            height: `${(BOX[2] - BOX[0]) / 10}%`,
            width: `${(BOX[3] - BOX[1]) / 10}%`,
            border: "4px solid #ef4444",
            borderRadius: 3,
            opacity: box,
            transform: `scale(${2 - box})`,
            boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
          }}
        >
          <span style={{ position: "absolute", bottom: "100%", left: -4, background: "#dc2626", color: "#fff", fontFamily: FONT, fontSize: 18, fontWeight: 700, padding: "3px 8px", whiteSpace: "nowrap" }}>Blocked drain</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 1060, top: 300, width: 740, borderRadius: 22, background: INK, padding: "34px 38px", fontFamily: "Consolas, 'SF Mono', monospace", fontSize: 27, lineHeight: 1.65, color: "#e2e8f0", boxShadow: "0 30px 70px rgba(15,23,42,0.25)" }}>
        <div style={{ color: "#64748b" }}>{"{"}</div>
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} style={{ paddingLeft: 28, color: i === lines.length - 1 ? "#fca5a5" : "#a7f3d0" }}>
            {l}
          </div>
        ))}
        <div style={{ color: "#64748b" }}>{shown >= lines.length ? "}" : "▍"}</div>
        <div style={{ marginTop: 18, fontFamily: FONT, fontSize: 22, color: "#94a3b8" }}>Schema-validated · advisory · boxes are AI-estimated</div>
      </div>
    </AbsoluteFill>
  );
};

const MapScene = () => {
  const frame = useCurrentFrame();
  const swap = frame > s(1.2);
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(4)) }}>
      <Backdrop />
      <Caption kicker={swap ? "Officer view" : "Secure sign-in"} title={swap ? "It appears on the map." : "Officers sign in."} />
      <div style={{ position: "absolute", left: 120, top: 330, fontFamily: FONT, fontSize: 30, color: "#475569", lineHeight: 1.5, maxWidth: 560 }}>
        {swap ? "OpenStreetMap basemap, severity markers, and uncertainty circles. Real positions are never shown as exact." : "Cognito sign-in. Every API call carries a short-lived token."}
      </div>
      {swap ? <Window key="map" src="web-map.png" zoom={[1.0, 1.12]} origin="30% 35%" /> : <Window key="signin" src="web-signin.png" zoom={[1.0, 1.03]} />}
    </AbsoluteFill>
  );
};

const IssueScene = () => {
  const frame = useCurrentFrame();
  const swap = frame > s(2.2);
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(4.5)) }}>
      <Backdrop />
      <Caption kicker="Issue dashboard" title={swap ? "Evidence, boxed." : "Explainable priority."} />
      <div style={{ position: "absolute", left: 120, top: 330, display: "flex", flexDirection: "column", gap: 18 }}>
        <Chip text="Score 28.8 / 100" delay={10} />
        <Chip text="Unknown ≠ zero risk" delay={20} />
        <Chip text="AI-estimated area" delay={s(2.4)} />
      </div>
      {swap ? <Window key="ev" src="web-evidence.png" zoom={[1.0, 1.08]} origin="35% 40%" /> : <Window key="issue" src="web-issue.png" zoom={[1.0, 1.05]} origin="60% 30%" />}
    </AbsoluteFill>
  );
};

const WorkOrderScene = () => {
  const frame = useCurrentFrame();
  const step = frame < s(1.4) ? "wo-create.png" : frame < s(2.6) ? "wo-created.png" : "wo-inspection.png";
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(4.5)) }}>
      <Backdrop />
      <Caption kicker="Work order created" title={frame < s(2.6) ? "An officer decides." : "Crews file what they find."} />
      <div style={{ position: "absolute", left: 120, top: 330, fontFamily: FONT, fontSize: 30, color: "#475569", lineHeight: 1.5, maxWidth: 560 }}>
        {frame < s(2.6) ? "AI never dispatches. A human approves every work order." : "Starting work opens an on-site inspection report with findings and photos."}
      </div>
      <Window key={step} src={step} zoom={[1.0, 1.04]} origin="70% 20%" />
    </AbsoluteFill>
  );
};

const ResolvedScene = () => {
  const frame = useCurrentFrame();
  const step = frame < s(1.5) ? "wo-closeout.png" : "wo-resolved.png";
  const check = useIn(s(1.6), 10);
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(3.5)) }}>
      <Backdrop />
      <Caption kicker="Work order resolved" title="Closed, with proof." />
      <div style={{ position: "absolute", left: 120, top: 330, fontFamily: FONT, fontSize: 30, color: "#475569", lineHeight: 1.5, maxWidth: 560 }}>
        Close-out notes and after photos, timestamped on the work order.
      </div>
      <Window key={step} src={step} zoom={[1.0, 1.04]} origin="70% 20%" />
      <div style={{ position: "absolute", left: 230, top: 600, width: 170, height: 170, borderRadius: 85, background: GREEN, display: "grid", placeItems: "center", opacity: check, transform: `scale(${check})`, boxShadow: "0 20px 50px rgba(0,166,80,0.45)" }}>
        <svg width="90" height="90" viewBox="0 0 24 24">
          <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" strokeDashoffset={30 - check * 30} />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

const Features = () => {
  const frame = useCurrentFrame();
  const chips = ["Offline-safe capture queue", "Duplicate-proof uploads", "Faces & plates blurred", "NCR city tagging", "Explicit failure states", "QuickSight analytics"];
  return (
    <AbsoluteFill style={{ opacity: fadeOut(frame, s(3)) }}>
      <Backdrop />
      <Caption kicker="And more" title="Built to be trusted." />
      <Window src="web-dashboard.png" zoom={[1.0, 1.05]} origin="50% 10%" style={{ right: 70, top: 180, width: 900, height: 620 }} />
      <div style={{ position: "absolute", left: 120, top: 330, display: "flex", flexWrap: "wrap", gap: 18, width: 700 }}>
        {chips.map((c, i) => (
          <Chip key={c} text={c} delay={6 + i * 6} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Outro = () => {
  const p = useIn(4, 20);
  const sub = useIn(18);
  return (
    <AbsoluteFill>
      <Backdrop dark />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: -5, opacity: p, transform: `scale(${0.92 + p * 0.08})` }}>
          ASTIG<span style={{ color: GREEN }}>.</span>
        </div>
        <div style={{ fontSize: 36, color: "#cbd5e1", marginTop: 6, opacity: sub }}>Capture → Detect → Locate → Prioritize → Act</div>
        <div style={{ fontSize: 22, color: "#64748b", marginTop: 40, opacity: sub, maxWidth: 1300, lineHeight: 1.5 }}>
          AI is advisory; officers decide. Demo data labelled. Prototype risk weights, not flood prediction. Footage: TFH TV, used with permission.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const AstigDemo = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Audio src={staticFile("pad.wav")} volume={0.35} />
    <Scene t={T.intro}><Intro /></Scene>
    <Scene t={T.journey}><Journey /></Scene>
    <Scene t={T.drive}><Drive /></Scene>
    <Scene t={T.capture}><Capture /></Scene>
    <Scene t={T.upload}><Upload /></Scene>
    <Scene t={T.analysis}><Analysis /></Scene>
    <Scene t={T.map}><MapScene /></Scene>
    <Scene t={T.issue}><IssueScene /></Scene>
    <Scene t={T.workOrder}><WorkOrderScene /></Scene>
    <Scene t={T.resolved}><ResolvedScene /></Scene>
    <Scene t={T.features}><Features /></Scene>
    <Scene t={T.outro}><Outro /></Scene>

    {/* Sound cues */}
    <Sfx at={0.2} src="whoosh.wav" volume={0.35} />
    <Sfx at={3.1} src="pop.wav" volume={0.4} />
    <Sfx at={T.capture[0]} src="shutter.wav" volume={0.9} />
    <Sfx at={T.capture[0] + 0.25} src="pop.wav" volume={0.5} />
    <Sfx at={T.upload[0] + 0.3} src="whoosh.wav" volume={0.5} />
    <Sfx at={T.upload[0] + 1.8} src="ding.wav" volume={0.35} />
    <Sfx at={T.analysis[0] + 2.2} src="pop.wav" volume={0.5} />
    <Sfx at={T.map[0] + 1.2} src="whoosh.wav" volume={0.35} />
    <Sfx at={T.issue[0] + 2.3} src="pop.wav" volume={0.45} />
    <Sfx at={T.workOrder[0] + 1.4} src="tick.wav" volume={0.8} />
    <Sfx at={T.workOrder[0] + 2.6} src="pop.wav" volume={0.45} />
    <Sfx at={T.resolved[0] + 1.6} src="ding.wav" volume={0.55} />
    <Sfx at={T.outro[0]} src="whoosh.wav" volume={0.4} />
  </AbsoluteFill>
);
