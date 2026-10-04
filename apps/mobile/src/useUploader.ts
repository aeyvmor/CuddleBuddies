/**
 * Runs upload passes (src/upload.ts) while an account is signed in and the app is open.
 * One pass at a time. A pass starts when captures are waiting, after sign-in, when the app
 * comes back to the foreground, and on a 30 s retry timer after a stopped pass (offline).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { UploadSessionInfo } from "./persist";
import type { CapturedEntry, QueueEntry } from "./queue";
import { describeUploadError, runUploadPass, uploadablePending, type UploadDeps } from "./upload";

const RETRY_MS = 30_000;
const PERF_TAG = "ASTIG_PERF";

export interface UploadStatus {
  phase: "OFF" | "IDLE" | "UPLOADING" | "WAITING_RETRY";
  lastError: { text: string; requestId: string | null } | null;
  lastUploadedAt: string | null;
}

export function useUploader(opts: {
  enabled: boolean;
  queue: QueueEntry[];
  sessions: Record<string, UploadSessionInfo>;
  deps: UploadDeps;
  onUploaded: (entry: CapturedEntry, observationId: string, at: Date) => void;
  onSession: (clientSessionId: string, info: UploadSessionInfo) => void;
  onAuthLost: () => void;
}): UploadStatus {
  const [status, setStatus] = useState<UploadStatus>({ phase: "OFF", lastError: null, lastUploadedAt: null });
  const [kick, setKick] = useState(0);
  const running = useRef(false);
  const latest = useRef(opts);
  latest.current = opts;

  const pending = uploadablePending(opts.queue, opts.sessions).length;
  const unreportedEnds = Object.values(opts.sessions).filter((s) => s.endedAt && s.serverId && !s.endReported).length;

  const runPass = useCallback(async () => {
    if (running.current || !latest.current.enabled) return;
    running.current = true;
    setStatus((s) => ({ ...s, phase: "UPLOADING" }));
    const t0 = Date.now();
    try {
      const o = latest.current;
      const r = await runUploadPass(o.queue, o.sessions, o.deps, {
        onUploaded: (entry, observationId, at) => {
          latest.current.onUploaded(entry, observationId, at);
          setStatus((s) => ({ ...s, lastUploadedAt: at.toISOString() }));
        },
        onSession: (id, info) => latest.current.onSession(id, info),
        now: () => new Date(),
      });
      // Counts and timing only: no tokens, coordinates or URLs in logs.
      console.log(`${PERF_TAG} upload_pass ms=${Date.now() - t0} uploaded=${r.uploaded} failed=${r.failed} stopped=${r.stopped} error=${r.error ? (r.error as { code?: string }).code ?? "error" : "none"}`);
      if (r.authLost) latest.current.onAuthLost();
      // A stopped pass (offline, server) or refused captures wait for the retry timer, so a
      // refused capture is never retried in a tight loop. A clean pass re-checks for new work.
      const wait = r.stopped || r.failed > 0;
      setStatus((s) => ({ ...s, phase: wait ? "WAITING_RETRY" : "IDLE", lastError: r.error ? describeUploadError(r.error) : null }));
      if (!wait) setKick((k) => k + 1);
    } catch (e) {
      setStatus((s) => ({ ...s, phase: "WAITING_RETRY", lastError: describeUploadError(e) }));
    } finally {
      running.current = false;
    }
  }, []);

  // Start a pass whenever there is work, or after a kick (foreground, retry timer, a clean pass).
  // While waiting to retry, new work does not start a pass early: the timer does.
  useEffect(() => {
    if (!opts.enabled) {
      setStatus((s) => ({ ...s, phase: "OFF" }));
      return;
    }
    if (status.phase === "WAITING_RETRY") return;
    if (pending > 0 || unreportedEnds > 0) void runPass();
    else setStatus((s) => (s.phase === "UPLOADING" ? s : { ...s, phase: "IDLE" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, pending, unreportedEnds, kick, runPass]);

  useEffect(() => {
    if (status.phase !== "WAITING_RETRY" || !opts.enabled) return;
    const t = setTimeout(() => {
      setStatus((s) => ({ ...s, phase: "IDLE" }));
      setKick((k) => k + 1);
    }, RETRY_MS);
    return () => clearTimeout(t);
  }, [status.phase, opts.enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        setStatus((st) => (st.phase === "WAITING_RETRY" ? { ...st, phase: "IDLE" } : st));
        setKick((k) => k + 1);
      }
    });
    return () => sub.remove();
  }, []);

  return status;
}
