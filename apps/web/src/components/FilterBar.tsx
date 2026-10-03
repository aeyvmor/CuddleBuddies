import type { IssueFilters, IssueType, Severity, WorkOrderStatus } from "../api/types";
import { label } from "../domain/labels";
import styles from "./FilterBar.module.css";

const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const TYPES: IssueType[] = ["BLOCKED_DRAIN", "STANDING_WATER", "DEBRIS", "DAMAGED_ROAD"];
const STATUSES: (WorkOrderStatus | "NONE")[] = ["NONE", "OPEN", "IN_PROGRESS", "RESOLVED"];

interface Props {
  filters: IssueFilters;
  areas: string[];
  onChange: (next: IssueFilters) => void;
}

function Field<T extends string>(props: {
  name: string;
  value: T | undefined;
  options: T[];
  render?: (v: T) => string;
  onChange: (v: T | undefined) => void;
}) {
  const render = props.render ?? label;
  return (
    <label className={styles.field}>
      <span>{props.name}</span>
      <select
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
      <Field name="Type" value={filters.issue_type} options={TYPES} onChange={(v) => onChange({ ...filters, issue_type: v })} />
      <Field name="Area" value={filters.area_name} options={areas} render={(a) => a} onChange={(v) => onChange({ ...filters, area_name: v })} />
      <Field
        name="Work order"
        value={filters.work_order_status}
        options={STATUSES}
        render={(s) => (s === "NONE" ? "No work order" : label(s))}
        onChange={(v) => onChange({ ...filters, work_order_status: v })}
      />
    </form>
  );
}
