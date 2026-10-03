import { IssueStatus, IssueType, SeverityEstimate, WorkOrderStatus } from "@astig/contracts";
import type { IssueListFilters } from "../api/types";
import { activeFilterCount } from "../domain/filters";
import { label } from "../domain/labels";
import styles from "./FilterBar.module.css";

// Options come from the contract enums, so new values appear without UI edits.
const SEVERITIES = SeverityEstimate.options;
/** The contract's list query has no NONE type (an issue always has a real type). */
const TYPES = IssueType.options.filter((t): t is Exclude<IssueType, "NONE"> => t !== "NONE");
const ISSUE_STATUSES = IssueStatus.options;
const WORK_ORDER_STATUSES = ["NONE", ...WorkOrderStatus.options] as const;

interface Props {
  filters: IssueListFilters;
  areas: string[];
  /** Issues matching the filters, and in total (both null while loading). */
  shown: number | null;
  total: number | null;
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
  const active = props.value !== undefined;
  return (
    <label className={styles.field}>
      <span className={styles.label}>{props.name}</span>
      <select
        className={styles.select}
        data-active={active || undefined}
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

export function FilterBar({ filters, areas, shown, total, onChange }: Props) {
  const active = activeFilterCount(filters);
  return (
    <form className={styles.bar} aria-label="Issue filters" onSubmit={(e) => e.preventDefault()}>
      <div className={styles.fields}>
        <Field name="Severity" value={filters.severity} options={SEVERITIES} onChange={(v) => onChange({ ...filters, severity: v })} />
        <Field name="Type" value={filters.issueType} options={TYPES} onChange={(v) => onChange({ ...filters, issueType: v })} />
        <Field name="Area" value={filters.areaName} options={areas} render={(a) => a} onChange={(v) => onChange({ ...filters, areaName: v })} />
        <Field name="Issue status" value={filters.status} options={ISSUE_STATUSES} onChange={(v) => onChange({ ...filters, status: v })} />
        <Field
          name="Work order"
          value={filters.workOrderStatus}
          options={WORK_ORDER_STATUSES}
          render={(s) => (s === "NONE" ? "No work order" : label(s))}
          onChange={(v) => onChange({ ...filters, workOrderStatus: v })}
        />
      </div>
      <div className={styles.footer}>
        <p className={styles.result} aria-live="polite">
          {shown === null || total === null ? "Loading issues…" : active > 0 ? `Showing ${shown} of ${total} issues` : `Showing all ${total} issues`}
        </p>
        {active > 0 && (
          <button type="button" className={styles.clear} onClick={() => onChange({})}>
            Clear filters ({active})
          </button>
        )}
      </div>
    </form>
  );
}
