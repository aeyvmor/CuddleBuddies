import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiClient, ResolutionPhotoInput } from "./api/client";
import {
  ApiError,
  errorText,
  type AnalyticsSummaryResponse,
  type IssueDetailResponse,
  type IssueListFilters,
  type IssueListItem,
  type Role,
  type WorkOrderStatus,
} from "./api/types";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { DemoBadge } from "./components/DemoBadge";
import { Icon } from "./components/Icon";
import { SummaryTiles } from "./components/SummaryTiles";
import { sortByPriority } from "./domain/filters";
import { label } from "./domain/labels";
import { FilterBar } from "./components/FilterBar";
import { IssueDetailPanel, type QueuePosition } from "./components/IssueDetailPanel";
import { IssueList } from "./components/IssueList";
import { IssueMap } from "./components/IssueMap";
import type { CreateInput } from "./components/WorkOrderPanel";
import styles from "./App.module.css";

/** Who is using the dashboard. Live: from sign-in. Mock: a demo role picker. */
export type Account =
  | { kind: "signed-in"; username: string; onSignOut: () => void }
  | { kind: "demo-role"; onRoleChange: (role: Role) => void };

interface Props {
  api: ApiClient;
  role: Role;
  account: Account;
  /** Where data comes from, shown in the sidebar. */
  dataSource: "mock" | "live";
}

const describe = (e: unknown) => {
  const text = errorText(e, "Could not load issues.");
  return e instanceof ApiError && e.requestId ? `${text} (reference ${e.requestId})` : text;
};

export function App({ api, role, account, dataSource }: Props) {
  const [filters, setFilters] = useState<IssueListFilters>({});
  /** Null until loaded, and after a failed load: never shown as "0 issues". */
  const [items, setItems] = useState<IssueListItem[] | null>(null);
  const [moreExist, setMoreExist] = useState(false);
  const [allItems, setAllItems] = useState<IssueListItem[] | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IssueDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [detailVersion, setDetailVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // Summary tiles, the total count and the area options come from the unfiltered list (areaNames is in the response).
  useEffect(() => {
    let cancelled = false;
    api
      .listIssues({})
      .then((all) => {
        if (cancelled) return;
        setAllItems(all.items);
        setAreas(all.areaNames);
      })
      .catch((e) => {
        if (cancelled) return;
        setAllItems(null);
        setLoadError(describe(e));
      });
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
        setItems(list.items);
        setMoreExist(list.nextCursor !== null);
      })
      .catch((e) => {
        if (cancelled) return;
        setItems(null);
        setLoadError(describe(e));
      });
    return () => {
      cancelled = true;
    };
  }, [api, filters, version]);

  useEffect(() => {
    let cancelled = false;
    api
      .analyticsSummary()
      .then((s) => {
        if (cancelled) return;
        setSummaryError(null);
        setSummary(s);
      })
      .catch((e) => {
        if (cancelled) return;
        setSummary(null);
        setSummaryError(describe(e));
      });
    return () => {
      cancelled = true;
    };
  }, [api, version]);

  // Image links last ~5 minutes. A failed image may trigger one refetch of the issue; the
  // detail fetched for that retry is remembered, so a second failure shows the error instead of looping.
  const imageRetryPending = useRef(false);
  const [retriedDetail, setRetriedDetail] = useState<IssueDetailResponse | null>(null);

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
        if (imageRetryPending.current) {
          imageRetryPending.current = false;
          setRetriedDetail(d);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        imageRetryPending.current = false;
        setDetail(null);
        setDetailError(describe(e));
      });
    return () => {
      cancelled = true;
    };
  }, [api, selectedId, role, version, detailVersion]);

  /** Queue order drives the list and Previous/Next. */
  const queue = useMemo(() => (items ? sortByPriority(items) : null), [items]);
  const index = queue && selectedId ? queue.findIndex((i) => i.issue.id === selectedId) : -1;
  const visible = index >= 0;
  const shownDetail = detail && visible && detail.issue.id === selectedId ? detail : null;
  const anySynthetic = (allItems ?? items ?? []).some((i) => i.issue.isSynthetic);

  const imageRetry = {
    canRetry: shownDetail !== null && shownDetail !== retriedDetail,
    onExpired: () => {
      if (imageRetryPending.current) return;
      imageRetryPending.current = true;
      setDetailVersion((v) => v + 1);
    },
  };
  const reloadDetail = () => setDetailVersion((v) => v + 1);

  const position: QueuePosition | null =
    queue && visible
      ? {
          index,
          total: queue.length,
          onPrevious: index > 0 ? () => setSelectedId(queue[index - 1]!.issue.id) : null,
          onNext: index < queue.length - 1 ? () => setSelectedId(queue[index + 1]!.issue.id) : null,
        }
      : null;

  // The detail renders below the map and queue, so bring it into view when a new issue opens.
  // Focus is not moved; the status region announces it and the skip link jumps to it.
  const detailRef = useRef<HTMLDivElement>(null);
  const shownId = shownDetail?.issue.id ?? null;
  useEffect(() => {
    const el = detailRef.current;
    if (shownId && el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
  }, [shownId]);

  // Announce which issue the detail panel now shows (it renders away from the control that was pressed).
  const shownTitle = shownDetail ? label(shownDetail.issue.issueType) : null;
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (shownTitle && position) setAnnouncement(`Showing issue detail: ${shownTitle}, ${position.index + 1} of ${position.total}.`);
    // position changes identity every render; index/total are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownTitle, shownDetail?.issue.id, position?.index, position?.total]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setAnnouncement("Issue detail closed.");
    document.getElementById("issue-queue")?.scrollIntoView?.({ block: "start" });
  }, []);

  /** Writes refetch afterwards. A 409 means the issue changed on the server: refetch, then show the message. */
  async function write(action: () => Promise<unknown>) {
    try {
      await action();
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) refresh();
      throw e;
    }
  }

  async function createWorkOrder(input: CreateInput) {
    const d = shownDetail;
    if (!d?.riskAssessment) return;
    const riskAssessmentId = d.riskAssessment.id; // the score the officer reviewed
    await write(() =>
      api.createWorkOrder(d.issue.id, {
        idempotencyKey: input.idempotencyKey,
        riskAssessmentId,
        ...(input.assignedTeam ? { assignedTeam: input.assignedTeam } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      }),
    );
  }

  async function advanceWorkOrder(id: string, status: WorkOrderStatus, details?: { notes?: string; assignedTeam?: string }) {
    await write(() => api.updateWorkOrder(id, { status, ...details }));
  }

  async function addPhoto(workOrderId: string, input: ResolutionPhotoInput) {
    await write(() => api.addResolutionPhoto(workOrderId, input));
  }

  const unavailable = loadError ? "Issues could not be loaded." : "Loading issues…";

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

      <aside className={styles.sidebar}>
        <p className={styles.brand}>
          ASTIG <span className={styles.brandTag}>OPS</span>
        </p>
        <nav aria-label="Sections" className={styles.nav}>
          <p className={styles.navTitle}>Municipal operations</p>
          <a className={styles.navLink} href="#overview" aria-current="page">
            <Icon name="dashboard" className={styles.navIcon} />
            Command center
          </a>
          <a className={styles.navLink} href="#issue-queue">
            <Icon name="queue" className={styles.navIcon} />
            Issue queue
          </a>
          {shownDetail ? (
            <a className={styles.navLink} href="#issue-detail">
              <Icon name="detail" className={styles.navIcon} />
              Issue review
            </a>
          ) : (
            <span className={styles.navLink} data-disabled="true">
              <Icon name="detail" className={styles.navIcon} />
              Issue review
              <span className={styles.navHint}>Select an issue</span>
            </span>
          )}
          <a className={styles.navLink} href="#analytics">
            <Icon name="gauge" className={styles.navIcon} />
            Analytics
          </a>
        </nav>
        <div className={styles.source}>
          <Icon name="database" className={styles.sourceIcon} />
          <p className={styles.sourceText}>
            <span className={styles.sourceTitle}>Data source</span>
            {dataSource === "live" ? "ASTIG API (dev)" : "Built-in demo data (offline)"}
            {anySynthetic && <span>Includes synthetic records</span>}
          </p>
        </div>
      </aside>

      <div className={styles.page}>
        <header className={styles.topbar}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Drainage and road issues</p>
            <h1 className={styles.title}>Command center</h1>
          </div>
          {anySynthetic && <DemoBadge />}
          {account.kind === "signed-in" ? (
            <div className={styles.role}>
              <span className={styles.avatar}>
                <Icon name="user" />
              </span>
              <span className={styles.roleText}>
                <span className={styles.roleLabel}>{account.username}</span>
                <span className={styles.roleNote}>Signed in · {role === "OFFICER" ? "Officer" : "No officer role"}</span>
              </span>
              <button type="button" className={styles.signOut} onClick={account.onSignOut}>
                Sign out
              </button>
            </div>
          ) : (
            <label className={styles.role}>
              <span className={styles.avatar}>
                <Icon name="user" />
              </span>
              <span className={styles.roleText}>
                <span className={styles.roleLabel}>Demo role</span>
                <span className={styles.roleNote}>Offline demo; no sign-in</span>
              </span>
              <select className={styles.roleSelect} value={role} onChange={(e) => account.onRoleChange(e.target.value as Role)}>
                <option value="OPERATOR">Operator</option>
                <option value="OFFICER">Officer</option>
              </select>
            </label>
          )}
        </header>

        <main className={styles.content}>
          <div id="overview" className={styles.anchor}>
            <SummaryTiles items={allItems} />
          </div>
          <FilterBar filters={filters} areas={areas} shown={items?.length ?? null} total={allItems?.length ?? null} onChange={setFilters} />
          {moreExist && <p className={styles.notice}>Only the first {items?.length ?? 0} matching issues are loaded. Narrow the filters to see the rest.</p>}
          {loadError && (
            <div role="alert" className={styles.errorRow}>
              <p className={styles.errorText}>{loadError} Nothing below is current until this succeeds.</p>
              <button type="button" className={styles.retry} onClick={refresh}>
                <Icon name="refresh" /> Try again
              </button>
            </div>
          )}
          <div className={styles.board}>
            <IssueMap items={queue ?? []} selectedId={selectedId} onSelect={setSelectedId} emptyText={queue ? undefined : unavailable} />
            <div id="issue-queue" className={styles.anchor}>
              <IssueList items={queue} selectedId={selectedId} onSelect={setSelectedId} unavailableText={unavailable} />
            </div>
          </div>
          <div ref={detailRef} className={styles.anchor}>
            {shownDetail && position ? (
              <IssueDetailPanel
                detail={shownDetail}
                role={role}
                position={position}
                onClose={closeDetail}
                onCreateWorkOrder={createWorkOrder}
                onAdvanceWorkOrder={advanceWorkOrder}
                onAddPhoto={addPhoto}
                imageRetry={imageRetry}
                onReload={reloadDetail}
              />
            ) : detailError && visible ? (
              <p role="alert" className={styles.error}>
                {detailError}
              </p>
            ) : (
              <div className={styles.placeholder}>
                <span className={styles.placeholderIcon}>
                  <Icon name="detail" />
                </span>
                <p className={styles.placeholderTitle}>No issue selected</p>
                <p className={styles.placeholderText}>Select an issue on the map or in the queue to review its evidence.</p>
              </div>
            )}
          </div>
          <AnalyticsPanel summary={summary} error={summaryError} onRetry={refresh} />
        </main>
      </div>
    </div>
  );
}
