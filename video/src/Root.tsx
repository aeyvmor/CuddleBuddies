import { Composition } from "remotion";
import { AstigDemo, FPS, TOTAL } from "./AstigDemo";

export const Root = () => (
  <Composition id="AstigDemo" component={AstigDemo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
