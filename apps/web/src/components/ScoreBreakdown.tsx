import type { ScoreBreakdown as Score, ScoreComponent } from "../api/types";
import { label } from "../domain/labels";
import styles from "./ScoreBreakdown.module.css";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Row({ c }: { c: ScoreComponent }) {
  return (
    <tr>
      <th scope="row">{label(c.factor)}</th>
      <td className={styles.points}>
        {c.inputStatus === "KNOWN" ? (
          <>
            {fmt(c.weightedPoints)} / {fmt(c.cap)}
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
      <td className={styles.rationale}>{c.rationale}</td>
    </tr>
  );
}

export function ScoreBreakdown({ risk }: { risk: Score | null }) {
  if (!risk) {
    return (
      <section aria-label="Score breakdown" className={styles.section}>
        <h3 className={styles.heading}>Priority score</h3>
        <p className={styles.note}>Not scored yet.</p>
      </section>
    );
  }
  const unknown = risk.components.filter((c) => c.inputStatus === "UNKNOWN").length;
  return (
    <section aria-label="Score breakdown" className={styles.section}>
      <h3 className={styles.heading}>Priority score</h3>
      <p className={styles.total}>
        <span className={styles.totalValue}>{fmt(risk.totalScore)}</span>
        <span className={styles.totalMax}>/ 100</span>
      </p>
      <p className={styles.note}>
        {fmt(risk.totalScore)} of {fmt(risk.knownCapTotal)} measurable points. Prototype prioritization aid ({risk.formulaVersion}), not a
        validated flood-risk prediction.
        {unknown > 0 && ` ${unknown} input(s) unknown; they are not counted as zero risk.`}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Factor</th>
            <th scope="col">Points / max</th>
            <th scope="col">Rationale</th>
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
