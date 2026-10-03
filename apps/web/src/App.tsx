import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "./api/client";
import { ApiError, type ActorRole, type Issue, type IssueDetail, type IssueFilters, type WorkOrderStatus } from "./api/types";
import { DemoBadge } from "./components/DemoBadge";
import { FilterBar } from "./components/FilterBar";
import { IssueDetailPanel } from "./components/IssueDetailPanel";
import { IssueList } from "./components/IssueList";
import { IssueMap } from "./components/IssueMap";
import styles from "./App.module.css";

interface Props {
  api: ApiClient;
  role: ActorRole;
  onRoleChange: (role: ActorRole) => void;
}

function describe(e: unknown): string {
  return e instanceof ApiError ? e.message : "Could not load data. Try again.";
}

export function App({ api, role, onRoleChange }: Props) {
  const [filters, setFilters] = useState<IssueFilters>({});
  const [issues, setIssues] = useState<Issue[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    api
      .listIssues({})
      .then((all) => {
        if (cancelled) return;
        setAreas([...new Set(all.map((i) => i.area_name).filter((a): a is string => a !== null))].sort());
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
        setIssues(list);
      })
      .catch((e) => !cancelled && setLoadError(describe(e)));
    return () => {
      cancelled = true;
    };
  }, [api, filters, version]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    api
      .getIssue(selectedId)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setLoadError(describe(e)));
    return () => {
      cancelled = true;
    };
  }, [api, selectedId, version]);

  const shownDetail = detail && issues.some((i) => i.id === detail.id) ? detail : null;
  const anySynthetic = issues.some((i) => i.is_synthetic);

  async function createWorkOrder(input: { assignee: string | null; notes: string | null }) {
    if (!selectedId) return;
    await api.createWorkOrder(selectedId, input);
    refresh();
  }

  async function advanceWorkOrder(id: string, status: WorkOrderStatus) {
    await api.updateWorkOrder(id, { status });
    refresh();
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>ASTIG Operations</h1>
        {anySynthetic && <DemoBadge />}
        <label className={styles.role}>
          <span>Demo role (placeholder; real auth not yet decided)</span>
          <select value={role} onChange={(e) => onRoleChange(e.target.value as ActorRole)}>
            <option value="VIEWER">Viewer</option>
            <option value="OFFICER">Officer</option>
          </select>
        </label>
      </header>
      <FilterBar filters={filters} areas={areas} onChange={setFilters} />
      {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
      <main className={styles.main}>
        <div className={styles.left}>
          <IssueMap issues={issues} selectedId={selectedId} onSelect={setSelectedId} />
          <IssueList issues={issues} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className={styles.right}>
          {shownDetail ? (
            <IssueDetailPanel
              issue={shownDetail}
              role={role}
              onCreateWorkOrder={createWorkOrder}
              onAdvanceWorkOrder={advanceWorkOrder}
            />
          ) : (
            <p className={styles.placeholder}>Select an issue to review its evidence.</p>
          )}
        </div>
      </main>
    </div>
  );
}
