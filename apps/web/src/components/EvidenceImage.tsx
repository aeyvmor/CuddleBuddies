import { useState } from "react";
import type { DetectionRegion } from "@astig/contracts";
import type { EvidenceAccess } from "../api/types";
import { Icon } from "./Icon";
import { RegionImage } from "./RegionImage";

const EVIDENCE_REASON: Record<string, string> = {
  NOT_UPLOADED: "Image not uploaded",
  SIGNER_NOT_CONFIGURED: "Image access is not configured",
};

export interface ImageRetry {
  /** True when a failed image may still trigger one refetch of the issue (fresh short-lived URLs). */
  canRetry: boolean;
  /** Ask the page to refetch the issue. */
  onExpired: () => void;
}

/**
 * Each fetch of an issue produces new evidence objects. Their identity, not the URL, decides
 * when an image is retried: a refetch remounts the <img> (so the browser loads it again) and
 * clears a previous failure, even if the URL happens to be the same.
 */
const generations = new WeakMap<object, number>();
let nextGeneration = 0;
function generationOf(o: object): number {
  let g = generations.get(o);
  if (g === undefined) {
    g = ++nextGeneration;
    generations.set(o, g);
  }
  return g;
}

/**
 * One evidence image. Presigned URLs last about five minutes: when an image fails to load,
 * the issue is refetched once for fresh URLs. If it fails again, the failure is shown with a
 * manual reload, never a stand-in picture. UNAVAILABLE evidence shows its reason.
 */
export function EvidenceImage(props: {
  evidence: EvidenceAccess;
  alt: string;
  retry: ImageRetry;
  onReload: () => void;
  /** AI-estimated problem areas to outline (optional; advisory). */
  regions?: DetectionRegion[];
  /** CSS Module class names (possibly undefined under noUncheckedIndexedAccess). */
  classes: { image?: string; placeholder?: string; placeholderIcon?: string; retryButton?: string };
}) {
  const { evidence, classes } = props;
  const generation = generationOf(evidence);
  const [brokenGeneration, setBrokenGeneration] = useState<number | null>(null);

  if (evidence.status === "UNAVAILABLE") {
    const text = EVIDENCE_REASON[evidence.reason] ?? evidence.reason;
    return (
      <div className={classes.placeholder} role="img" aria-label={`No image: ${text}`}>
        <Icon name="camera" className={classes.placeholderIcon} />
        {text}
      </div>
    );
  }
  if (brokenGeneration === generation) {
    return (
      <div className={classes.placeholder}>
        <Icon name="camera" className={classes.placeholderIcon} />
        <span>Image could not be loaded. The access link may have expired.</span>
        <button type="button" className={classes.retryButton} onClick={props.onReload}>
          <Icon name="refresh" /> Reload images
        </button>
      </div>
    );
  }
  const onError = () => {
    if (props.retry.canRetry) props.retry.onExpired();
    else setBrokenGeneration(generation);
  };
  // AI-estimated problem areas (Detection.regions) are drawn over the image when present.
  if (props.regions?.length) {
    return <RegionImage key={generation} src={evidence.url} alt={props.alt} regions={props.regions} onError={onError} />;
  }
  return (
    <img
      key={generation}
      className={classes.image}
      src={evidence.url}
      alt={props.alt}
      onError={onError}
    />
  );
}
