import type {
  Detection,
  IssueDetail,
  Observation,
  RiskAssessment,
  ScoreComponent,
  ScoreFactor,
} from "../api/types";

/**
 * SYNTHETIC DEMO DATA. Not captured from real roads; no real imagery or people.
 * Coordinates are placeholders in a generic grid; the real demo area is still a
 * team decision (docs/operations/privacy-and-demo-data.md).
 * Score totals here are illustrative sums only. The real score is computed by the
 * backend domain module, not by this client.
 */

const CAPS: Record<ScoreFactor, number> = {
  severity: 35,
  weather: 25,
  recurrence: 20,
  hazard: 10,
  exposure: 10,
};

function risk(points: Partial<Record<ScoreFactor, number>>): RiskAssessment {
  const components: ScoreComponent[] = (Object.keys(CAPS) as ScoreFactor[]).map((factor) => {
    const p = points[factor];
    return p === undefined
      ? { factor, status: "UNAVAILABLE", points: null, cap: CAPS[factor] }
      : { factor, status: "MEASURED", points: p, cap: CAPS[factor] };
  });
  const total = components.reduce((sum, c) => sum + (c.points ?? 0), 0);
  return { total, formula_version: "synthetic-demo-0", components };
}

function detection(d: Partial<Detection> & Pick<Detection, "issue_type" | "severity_estimate" | "evidence_description">): Detection {
  return {
    infrastructure_visible: true,
    obstruction_type: "synthetic",
    blockage_percent: null,
    confidence: 0.8,
    requires_human_review: true,
    model_version: "synthetic-demo",
    schema_version: "synthetic-demo-0",
    ...d,
  };
}

function obs(id: string, minute: number, lat: number, lon: number, det: Detection | null, extra: Partial<Observation> = {}): Observation {
  return {
    id,
    captured_at: `2026-10-03T01:${String(minute).padStart(2, "0")}:00Z`,
    latitude: lat,
    longitude: lon,
    horizontal_accuracy_m: 8,
    processing_status: det ? "COMPLETED" : "FAILED",
    error_code: det ? null : "PROVIDER_UNAVAILABLE",
    image_url: null,
    detection: det,
    ...extra,
  };
}

export function createSyntheticIssues(): IssueDetail[] {
  return [
    {
      id: "SYN-ISSUE-001",
      issue_type: "BLOCKED_DRAIN",
      severity: "HIGH",
      latitude: 14.5995,
      longitude: 120.9842,
      area_name: "Demo Zone A",
      location_uncertainty_m: 10,
      is_synthetic: true,
      observation_count: 2,
      risk: risk({ severity: 28, recurrence: 12, exposure: 6 }),
      recommendation: "Advisory: review for drain clearing. Weather and hazard inputs were not available.",
      work_order: null,
      observations: [
        obs(
          "SYN-OBS-001",
          5,
          14.5995,
          120.9842,
          detection({
            issue_type: "BLOCKED_DRAIN",
            severity_estimate: "HIGH",
            obstruction_type: "debris",
            blockage_percent: 70,
            confidence: 0.86,
            evidence_description: "Synthetic: grate appears mostly covered by debris.",
          }),
        ),
        obs("SYN-OBS-002", 9, 14.59952, 120.98422, null),
      ],
    },
    {
      id: "SYN-ISSUE-002",
      issue_type: "STANDING_WATER",
      severity: "CRITICAL",
      latitude: 14.6021,
      longitude: 120.9875,
      area_name: "Demo Zone B",
      location_uncertainty_m: 15,
      is_synthetic: true,
      observation_count: 1,
      risk: risk({ severity: 35, recurrence: 18, hazard: 8, exposure: 9 }),
      recommendation: "Advisory: review promptly for drainage inspection.",
      work_order: {
        id: "SYN-WO-001",
        issue_id: "SYN-ISSUE-002",
        status: "IN_PROGRESS",
        assignee: "Demo Crew 1",
        notes: "Synthetic work order.",
        created_at: "2026-10-03T02:00:00Z",
        updated_at: "2026-10-03T03:00:00Z",
      },
      observations: [
        obs(
          "SYN-OBS-003",
          20,
          14.6021,
          120.9875,
          detection({
            issue_type: "STANDING_WATER",
            severity_estimate: "CRITICAL",
            confidence: 0.55,
            requires_human_review: true,
            evidence_description: "Synthetic: ponding across the lane.",
          }),
        ),
      ],
    },
    {
      id: "SYN-ISSUE-003",
      issue_type: "DEBRIS",
      severity: "LOW",
      latitude: 14.6008,
      longitude: 120.9811,
      area_name: "Demo Zone A",
      location_uncertainty_m: 10,
      is_synthetic: true,
      observation_count: 1,
      risk: risk({ severity: 8, recurrence: 2, exposure: 3 }),
      recommendation: "Advisory: low priority; monitor on next pass.",
      work_order: null,
      observations: [
        obs(
          "SYN-OBS-004",
          31,
          14.6008,
          120.9811,
          detection({
            issue_type: "DEBRIS",
            severity_estimate: "LOW",
            confidence: 0.92,
            requires_human_review: false,
            evidence_description: "Synthetic: small debris at curb.",
          }),
        ),
      ],
    },
    {
      id: "SYN-ISSUE-004",
      issue_type: "DAMAGED_ROAD",
      severity: "MEDIUM",
      latitude: 14.5968,
      longitude: 120.9899,
      area_name: "Demo Zone C",
      location_uncertainty_m: null,
      is_synthetic: true,
      observation_count: 1,
      risk: risk({ severity: 17, weather: 10, recurrence: 5, hazard: 4, exposure: 5 }),
      recommendation: "Advisory: resolved; verify on next pass.",
      work_order: {
        id: "SYN-WO-002",
        issue_id: "SYN-ISSUE-004",
        status: "RESOLVED",
        assignee: "Demo Crew 2",
        notes: "Synthetic work order.",
        created_at: "2026-10-02T02:00:00Z",
        updated_at: "2026-10-02T06:00:00Z",
      },
      observations: [
        obs(
          "SYN-OBS-005",
          40,
          14.5968,
          120.9899,
          detection({
            issue_type: "DAMAGED_ROAD",
            severity_estimate: "MEDIUM",
            confidence: 0.74,
            evidence_description: "Synthetic: surface cracking.",
          }),
          { horizontal_accuracy_m: null },
        ),
      ],
    },
  ];
}
