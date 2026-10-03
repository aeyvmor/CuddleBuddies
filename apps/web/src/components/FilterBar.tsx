import { IssueType, SeverityEstimate, WorkOrderStatus } from "@astig/contracts";
import type { IssueListFilters } from "../api/types";
import { label } from "../domain/labels";
import styles from "./FilterBar.module.css";

// Options come from the contract enums, so new values appear without UI edits.
const SEVERITIES = SeverityEstimate.options;
const TYPES = IssueType.options;
const STATUSES = ["NONE", ...WorkOrderStatus.options] as const;

interface Props {
  filters: IssueListFilters;
  areas: string[];
  onChange: (next: IssueListFilters) => void;
}

function Field<T extends string>(props: {
  name: string;
  value: T | undefined;
  options: readonly T[];
  render?: (v: T) => string;
  onChange: (v: T | undefined) => void;
}) {
  const render = props.render ?? label;
  return (
    <label className={styles.field}>
      <span className={styles.label}>{props.name}</span>
      <select
        className={styles.select}
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value === "" ? undefined : (e.target.value as T))}
      >
        <option value="">All</option>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {render(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({ filters, areas, onChange }: Props) {
  return (
    <form className={styles.bar} aria-label="Issue filters" onSubmit={(e) => e.preventDefault()}>
      <Field name="Severity" value={filters.severity} options={SEVERITIES} onChange={(v) => onChange({ ...filters, severity: v })} />
      <Field name="Type" value={filters.issueType} options={TYPES} onChange={(v) => onChange({ ...filters, issueType: v })} />
      <Field name="Area" value={filters.areaName} options={areas} render={(a) => a} onChange={(v) => onChange({ ...filters, areaName: v })} />
      <Field
        name="Work order"
        value={filters.workOrderStatus}
        options={STATUSES}
        render={(s) => (s === "NONE" ? "No work order" : label(s))}
        onChange={(v) => onChange({ ...filters, workOrderStatus: v })}
      />
    </form>
  );
}
