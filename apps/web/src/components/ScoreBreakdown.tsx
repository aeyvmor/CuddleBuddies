import type { ScoreComponent, RiskAssessment } from "../api/types";
import { label } from "../domain/labels";
import styles from "./ScoreBreakdown.module.css";

function Row({ c }: { c: ScoreComponent }) {
  return (
    <tr>
      <th scope="row">{label(c.factor)}</th>
      <td>{c.status === "MEASURED" ? `${c.points} / ${c.cap}` : <em>Unavailable (not measured) / {c.cap}</em>}</td>
    </tr>
  );
}

export function ScoreBreakdown({ risk }: { risk: RiskAssessment }) {
  const unavailable = risk.components.filter((c) => c.status === "UNAVAILABLE").length;
  return (
    <section aria-label="Score breakdown" className={styles.section}>
      <h3>
        Priority score: {risk.total} / 100
      </h3>
      <p className={styles.note}>
        Prototype prioritization aid ({risk.formula_version}), not a validated flood-risk prediction.
        {unavailable > 0 && ` ${unavailable} input(s) unavailable; they are not counted as zero risk.`}
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Factor</th>
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
