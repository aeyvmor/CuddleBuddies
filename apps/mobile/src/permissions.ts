/**
 * What to tell the operator about each permission. Pure, tested without a device.
 * A refusal always says what will not work and how to fix it.
 */
export type PermissionKind = "CAMERA" | "LOCATION";

/** Mirrors expo's PermissionResponse fields that matter here. */
export interface PermissionSnapshot {
  granted: boolean;
  /** expo: "granted" | "denied" | "undetermined". */
  status: string;
  canAskAgain: boolean;
}

export type PermissionView =
  | { state: "GRANTED"; title: string; body: string }
  | { state: "NOT_ASKED"; title: string; body: string }
  | { state: "REFUSED"; title: string; body: string; fix: "ASK_AGAIN" | "OPEN_SETTINGS" };

const REASON: Record<PermissionKind, string> = {
  CAMERA: "to take the road photos",
  LOCATION: "to record where each photo was taken and how far the vehicle has travelled",
};

const BROKEN: Record<PermissionKind, string> = {
  CAMERA: "No photos can be taken, so a session cannot start.",
  LOCATION: "Photos would have no location and distance cannot be counted, so a session cannot start.",
};

const NAME: Record<PermissionKind, string> = { CAMERA: "Camera", LOCATION: "Location" };

export function describePermission(kind: PermissionKind, p: PermissionSnapshot | null): PermissionView {
  if (p?.granted) return { state: "GRANTED", title: `${NAME[kind]}: allowed`, body: `Used ${REASON[kind]}.` };
  if (!p || p.status === "undetermined") return { state: "NOT_ASKED", title: `${NAME[kind]}: not asked yet`, body: `ASTIG needs the ${NAME[kind].toLowerCase()} ${REASON[kind]}. You will be asked when you start.` };
  if (p.canAskAgain) {
    return { state: "REFUSED", title: `${NAME[kind]}: refused`, body: `${BROKEN[kind]} Tap "Ask again" and choose Allow.`, fix: "ASK_AGAIN" };
  }
  return {
    state: "REFUSED",
    title: `${NAME[kind]}: blocked`,
    body: `${BROKEN[kind]} Android will not ask again. Open Settings, then Permissions, then ${NAME[kind]}, and choose ${kind === "LOCATION" ? '"Allow only while using the app" with precise location on' : '"Allow only while using the app"'}.`,
    fix: "OPEN_SETTINGS",
  };
}

export const allGranted = (camera: PermissionSnapshot | null, location: PermissionSnapshot | null) => !!camera?.granted && !!location?.granted;
