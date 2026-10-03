import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "./api/client";
import {
  ApiError,
  type IssueDetailResponse,
  type IssueListFilters,
  type IssueListItem,
  type Role,
  type WorkOrderStatus,
} from "./api/types";
import { DemoBadge } from "./components/DemoBadge";
import { label } from "./domain/labels";
import { FilterBar } from "./components/FilterBar";
import { IssueDetailPanel } from "./components/IssueDetailPanel";
import { IssueList } from "./components/IssueList";
import { IssueMap } from "./components/IssueMap";
import type { CreateInput } from "./components/WorkOrderPanel";
import styles from "./App.module.css";

interface Props {
  api: ApiClient;
  role: Role;
  onRoleChange: (role: Role) => void;
}

function describe(e: unknown): string {
  return e instanceof ApiError ? e.message : "Could not load data. Try again.";
}

export function App({ api, role, onRoleChange }: Props) {
  const [filters, setFilters] = useState<IssueListFilters>({});
  const [items, setItems] = useState<IssueListItem[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IssueDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // [gap G1/G5] Area options come from an unfiltered list call until the contract defines a source.
  useEffect(() => {
    let cancelled = false;
    api
      .listIssues({})
      .then((all) => {
        if (cancelled) return;
        setAreas([...new Set(all.map((i) => i.issue.areaName).filter((a): a is string => a !== null))].sort());
      })
      .catch((e) => !cancelled && setLoadError(describe(e)));
    return () => {
      cancelled = true;
    };
  }, [api, version]);

  useEffect(() => {
    let cancelled = false;
    api
      .listIssues(filters)
      .then((list) => {
        if (cancelled) return;
        setLoadError(null);
        setItems(list);
      })
      .catch((e) => !cancelled && setLoadError(describe(e)));
    return () => {
      cancelled = true;
    };
  }, [api, filters, version]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    api
      .getIssue(selectedId)
      .then((d) => {
        if (cancelled) return;
        setDetailError(null);
        setDetail(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(describe(e));
      });
    return () => {
      cancelled = true;
    };
  }, [api, selectedId, role, version]);

  const visible = items.some((i) => i.issue.id === selectedId);
  const shownDetail = detail && visible && detail.issue.id === selectedId ? detail : null;
  const anySynthetic = items.some((i) => i.issue.isSynthetic);

  // Announce which issue the detail panel now shows (it renders away from the control that was pressed).
  const shownTitle = shownDetail ? label(shownDetail.issue.issueType) : null;
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (shownTitle) setAnnouncement(`Showing issue detail: ${shownTitle}.`);
  }, [shownTitle, shownDetail?.issue.id]);

  async function createWorkOrder(input: CreateInput) {
    if (!shownDetail?.riskAssessment) return;
    await api.createWorkOrder(shownDetail.issue.id, {
      idempotencyKey: input.idempotencyKey,
      riskAssessmentId: shownDetail.riskAssessment.id,
      ...(input.assignedTeam ? { assignedTeam: input.assignedTeam } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    });
    refresh();
  }

  async function advanceWorkOrder(id: string, status: WorkOrderStatus) {
    await api.updateWorkOrder(id, { status });
    refresh();
  }

  return (
    <div className={styles.app}>
      {shownDetail && (
        <a className={styles.skip} href="#issue-detail">
          Skip to issue detail
        </a>
      )}
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
      <header className={styles.header}>
        <h1 className={styles.brand}>
          ASTIG <span className={styles.brandSub}>Operations</span>
        </h1>
        {anySynthetic && <DemoBadge />}
        <label className={styles.role}>
          <span>Demo role (placeholder; real auth not yet decided)</span>
          <select className={styles.roleSelect} value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>
            <option value="OPERATOR">Operator</option>
            <option value="OFFICER">Officer</option>
          </select>
        </label>
      </header>
      <div className={styles.content}>
        <FilterBar filters={filters} areas={areas} onChange={setFilters} />
        {loadError && (
          <p role="alert" className={styles.error}>
            {loadError}
          </p>
        )}
        <main className={styles.main}>
          <div className={styles.left}>
            <IssueMap items={items} selectedId={selectedId} onSelect={setSelectedId} />
            <IssueList items={items} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className={styles.right}>
            {shownDetail ? (
              <IssueDetailPanel
                detail={shownDetail}
                role={role}
                onCreateWorkOrder={createWorkOrder}
                onAdvanceWorkOrder={advanceWorkOrder}
              />
            ) : detailError && visible ? (
              <p role="alert" className={styles.error}>
                {detailError}
              </p>
            ) : (
              <p className={styles.placeholder}>Select an issue to review its evidence.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
