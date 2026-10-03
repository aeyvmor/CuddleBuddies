/**
 * AR view for the "AR tracking with motion gate" source. ARCore owns the camera while
 * this is mounted, so captures are frames of this view (takeScreenshot), not camera photos.
 * Same Viro wiring as the diagnostics screen, with its own sink so the two never share state.
 */
import type React from "react";
import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ViroARScene, ViroARSceneNavigator, ViroTrackingStateConstants } from "@reactvision/react-viro";
import type { VioTracking } from "../distance";

export interface FrameResult {
  success?: boolean;
  url?: string;
  errorCode?: number;
}

export const sessionVioSink: {
  onPose?: (p: [number, number, number]) => void;
  onTracking?: (t: VioTracking) => void;
  takeFrame?: (fileName: string) => Promise<FrameResult>;
} = {};

function Scene(props: { arSceneNavigator?: { takeScreenshot: (fileName: string, saveToCameraRoll: boolean) => Promise<FrameResult> } }) {
  const nav = props.arSceneNavigator;
  useEffect(() => {
    // saveToCameraRoll false: frames stay in app storage, never in the gallery.
    sessionVioSink.takeFrame = nav ? (fileName) => nav.takeScreenshot(fileName, false) : undefined;
    return () => {
      sessionVioSink.takeFrame = undefined;
    };
  }, [nav]);
  return (
    <ViroARScene
      onTrackingUpdated={(state) => {
        const t: VioTracking =
          state === ViroTrackingStateConstants.TRACKING_NORMAL ? "NORMAL" : state === ViroTrackingStateConstants.TRACKING_LIMITED ? "LIMITED" : "UNAVAILABLE";
        sessionVioSink.onTracking?.(t);
      }}
      onCameraTransformUpdate={(t) => sessionVioSink.onPose?.(t.position)}
    />
  );
}

export function ArView({ style }: { style: StyleProp<ViewStyle> }) {
  return <ViroARSceneNavigator initialScene={{ scene: Scene as () => React.JSX.Element }} autofocus worldAlignment="Gravity" style={style} />;
}
