import { z } from "zod";
import { IssueType, SeverityEstimate } from "./detection";
import { Issue, IssueStatus } from "./issue";
import { UtcInstant } from "./common";
import { ProcessingStatus } from "./observation";
import { WorkOrderStatus } from "./work-order";

export const ISSUE_LIST_DEFAULT_LIMIT = 50;
export const ISSUE_LIST_MAX_LIMIT = 200;

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max);

/**
 * `GET /issues` query string (role OFFICER). All filters optional.
 * `bbox` = "minLon,minLat,maxLon,maxLat" (WGS84). `cursor` is opaque.
 */
export const IssueListQuery = z
  .strictObject({
    severity: SeverityEstimate.optional(),
    issueType: IssueType.exclude(["NONE"]).optional(),
    areaName: z.string().trim().min(1).max(200).optional(),
    status: IssueStatus.optional(),
    /** NONE = issues without any work order. */
    workOrderStatus: z.union([WorkOrderStatus, z.literal("NONE")]).optional(),
    bbox: z
      .string()
      .transform((s, ctx) => {
        const parts = s.split(",").map((p) => Number(p));
        const parsed = z.tuple([coord(-180, 180), coord(-90, 90), coord(-180, 180), coord(-90, 90)]).safeParse(parts);
        if (!parsed.success || parts.length !== 4) {
          ctx.addIssue({ code: "custom", message: "bbox must be minLon,minLat,maxLon,maxLat in WGS84 degrees" });
          return z.NEVER;
        }
        const [minLon, minLat, maxLon, maxLat] = parsed.data;
        if (minLon >= maxLon || minLat >= maxLat) {
          ctx.addIssue({ code: "custom", message: "bbox minimums must be less than maximums" });
          return z.NEVER;
        }
        return { minLon, minLat, maxLon, maxLat };
      })
      .optional(),
    limit: z.coerce.number().int().min(1).max(ISSUE_LIST_MAX_LIMIT).default(ISSUE_LIST_DEFAULT_LIMIT),
    cursor: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  });
export type IssueListQuery = z.infer<typeof IssueListQuery>;

/** One map/list row: enough to render without fetching every issue's detail. */
export const IssueListItem = z.strictObject({
  issue: Issue,
  /** Highest severityEstimate across the issue's completed detections; null if none. */
  severity: SeverityEstimate.nullable(),
  /** totalScore of the latest risk assessment; null if not scored yet. */
  totalScore: z.number().min(0).max(100).nullable(),
  /** Status of the newest work order; null if the issue has none. */
  workOrderStatus: WorkOrderStatus.nullable(),
});
export type IssueListItem = z.infer<typeof IssueListItem>;

/** Sorted by totalScore (desc, unscored last), then lastObservedAt (desc), then id. */
export const IssueListResponse = z.strictObject({
  items: z.array(IssueListItem).max(ISSUE_LIST_MAX_LIMIT),
  nextCursor: z.string().nullable(),
  /** Distinct known area names (for the area filter), independent of the current filters. */
  areaNames: z.array(z.string()).max(200),
});
export type IssueListResponse = z.infer<typeof IssueListResponse>;

const Count = z.int().min(0);

/**
 * `GET /analytics/summary` (role OFFICER). Same SQL views as the S3/QuickSight export, so the
 * web dashboard and QuickSight agree. `includesSynthetic` must be shown as a demo-data label.
 */
export const AnalyticsSummaryResponse = z.strictObject({
  generatedAt: UtcInstant,
  includesSynthetic: z.boolean(),
  issues: z.strictObject({
    total: Count,
    open: Count,
    resolved: Count,
    byType: z.array(z.strictObject({ issueType: IssueType, count: Count })),
    bySeverity: z.array(z.strictObject({ severity: SeverityEstimate.nullable(), count: Count })),
    /** areaName null = not matched to an area. */
    byArea: z.array(z.strictObject({ areaName: z.string().nullable(), count: Count })),
  }),
  workOrders: z.strictObject({
    open: Count,
    inProgress: Count,
    resolved: Count,
    /** Mean hours from creation to resolution; null if none resolved. */
    meanResolutionHours: z.number().min(0).nullable(),
  }),
  recurrence: z.strictObject({
    /** Issues with more than one linked observation. */
    repeatIssues: Count,
    meanObservationsPerIssue: z.number().min(0).nullable(),
  }),
  coverage: z.strictObject({
    sessions: Count,
    observations: Count,
    /** Sum of client-reported distance between captures (an estimate, not surveyed length). */
    capturedDistanceM: z.number().min(0),
  }),
  processing: z.array(z.strictObject({ status: ProcessingStatus, count: Count })),
});
export type AnalyticsSummaryResponse = z.infer<typeof AnalyticsSummaryResponse>;
