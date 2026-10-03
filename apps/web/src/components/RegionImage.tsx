import type { DetectionRegion } from "@astig/contracts";
import { label } from "../domain/labels";
import styles from "./RegionImage.module.css";

interface Props {
  src: string;
  alt: string;
  regions: DetectionRegion[];
  /** Image failed to load (e.g. an expired presigned URL); see EvidenceImage. */
  onError?: () => void;
}

/**
 * Evidence image with AI-estimated problem areas drawn as red outlines. Boxes use the
 * [ymin, xmin, ymax, xmax] 0-1000 convention, so they scale with the image. The image is not
 * cropped here (cropping would misplace the boxes). Each box is also listed as text.
 */
export function RegionImage({ src, alt, regions, onError }: Props) {
  return (
    <figure className={styles.figure}>
      <div className={styles.wrap}>
        <img className={styles.image} src={src} alt={alt} onError={onError} />
        {regions.map((r, i) => {
          const [y0, x0, y1, x1] = r.box;
          return (
            <span
              key={i}
              className={styles.box}
              data-testid="region-box"
              aria-hidden="true"
              style={{ top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` }}
            >
              <span className={styles.tag}>{label(r.label)}</span>
            </span>
          );
        })}
      </div>
      <figcaption className={styles.caption}>
        {regions.length === 1 ? "1 AI-estimated problem area" : `${regions.length} AI-estimated problem areas`} outlined in red:{" "}
        {regions.map((r) => label(r.label)).join(", ")}. Approximate; an officer should verify.
      </figcaption>
    </figure>
  );
}
