import type { ScoreBreakdown as Score, ScoreComponent } from "../api/types";
import { label } from "../domain/labels";
import { Icon } from "./Icon";
import styles from "./ScoreBreakdown.module.css";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Decorative ring for the 0–100 total. The number beside it is the accessible value. */
function Gauge({ total }: { total: number }) {
  const filled = (Math.max(0, Math.min(100, total)) / 100) * CIRCUMFERENCE;
  return (
    <span className={styles.gauge} aria-hidden="true">
      <svg viewBox="0 0 100 100" className={styles.gaugeSvg}>
        <circle className={styles.gaugeTrack} cx="50" cy="50" r={RADIUS} />
        <circle
          className={styles.gaugeFill}
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={`${filled} ${CIRCUMFERENCE - filled}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className={styles.gaugeLabel}>{fmt(total)}</span>
    </span>
  );
}

function Row({ c }: { c: ScoreComponent }) {
  return (
    <tr>
      <th scope="row" className={styles.factor}>
        <span className={styles.factorName}>
          {label(c.factor)} <span className={styles.max}>({fmt(c.cap)} max)</span>
        </span>
        <span className={styles.rationale}>{c.rationale}</span>
      </th>
      <td className={styles.points}>
        {c.inputStatus === "KNOWN" ? (
          <>
            <span className={styles.value}>
              {fmt(c.weightedPoints)} / {fmt(c.cap)}
            </span>
            <span className={styles.bar} aria-hidden="true">
              <span className={styles.barFill} style={{ width: `${c.cap > 0 ? (c.weightedPoints / c.cap) * 100 : 0}%` }} />
            </span>
          </>
        ) : (
          <>
            <em className={styles.unknown}>Unknown (not measured) / {fmt(c.cap)}</em>
            <span className={styles.barUnknown} aria-hidden="true" />
          </>
        )}
      </td>
    </tr>
  );
}

function Heading() {
  return (
    <div className={styles.head}>
      <h3 className={styles.heading}>
        <Icon name="gauge" className={styles.headingIcon} />
        Priority score
      </h3>
      <span className={styles.tag}>Explainable · advisory</span>
    </div>
  );
}

export function ScoreBreakdown({ risk }: { risk: Score | null }) {
  if (!risk) {
    return (
      <section aria-label="Score breakdown" className={styles.section}>
        <Heading />
        <p className={styles.note}>Not scored yet.</p>
      </section>
    );
  }
  const unknown = risk.components.filter((c) => c.inputStatus === "UNKNOWN").length;
  return (
    <section aria-label="Score breakdown" className={styles.section}>
      <Heading />
      <div className={styles.summary}>
        <div>
          <p className={styles.eyebrow}>Total priority</p>
          <p className={styles.total}>
            <span className={styles.totalValue}>{fmt(risk.totalScore)}</span>
            <span className={styles.totalMax}>/ 100</span>
          </p>
        </div>
        <Gauge total={risk.totalScore} />
      </div>
      <p className={styles.note}>
        {fmt(risk.totalScore)} of {fmt(risk.knownCapTotal)} measurable points. Prototype prioritization aid ({risk.formulaVersion}), not a
        validated flood-risk prediction.
        {unknown > 0 && ` ${unknown} input(s) unknown; they are not counted as zero risk.`}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Factor and rationale</th>
            <th scope="col">Points / max</th>
          </tr>
        </thead>
        <tbody>
          {risk.components.map((c) => (
            <Row key={c.factor} c={c} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
