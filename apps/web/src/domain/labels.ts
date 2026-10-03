import type { SamplingMethod } from "../api/types";

/** "BLOCKED_DRAIN" -> "Blocked drain". Display text only; never used as a key. */
export function label(code: string): string {
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Acronyms kept upright; GPS distance is never presented as VIO. */
const SAMPLING: Record<SamplingMethod, string> = {
  VIO_DISTANCE: "VIO distance",
  GPS_DISTANCE: "GPS distance",
  MANUAL: "Manual",
  DASHCAM_REPLAY: "Dashcam replay (recorded footage)",
};

export function samplingLabel(m: SamplingMethod): string {
  return SAMPLING[m];
}

export function formatUtc(iso: string): string {
  return `${iso.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "")} UTC`;
}
