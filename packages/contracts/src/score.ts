import { z } from "zod";
import { Uuid, UtcInstant } from "./common";

export const RISK_FORMULA_VERSION = "risk.v0" as const;

export const RiskFactor = z.enum(["SEVERITY", "WEATHER", "RECURRENCE", "HAZARD", "EXPOSURE"]);
export type RiskFactor = z.infer<typeof RiskFactor>;

/** KNOWN = measured/derived input; UNKNOWN = unavailable input. UNKNOWN is never zero risk. */
export const InputStatus = z.enum(["KNOWN", "UNKNOWN"]);
export type InputStatus = z.infer<typeof InputStatus>;

const Points = z.number().min(0).max(100);

const componentBase = {
  factor: RiskFactor,
  weight: z.number().min(0).max(1),
  cap: Points,
  source: z.string().min(1).max(200).nullable(),
  rationale: z.string().min(1).max(500),
};

export const ScoreComponent = z
  .discriminatedUnion("inputStatus", [
    z.strictObject({ ...componentBase, inputStatus: z.literal("KNOWN"), normalizedValue: Points, weightedPoints: Points }),
    z.strictObject({ ...componentBase, inputStatus: z.literal("UNKNOWN"), normalizedValue: z.null(), weightedPoints: z.null() }),
  ])
  .refine((c) => c.weightedPoints === null || c.weightedPoints <= c.cap, {
    message: "weightedPoints must not exceed cap",
    path: ["weightedPoints"],
  });
export type ScoreComponent = z.infer<typeof ScoreComponent>;

/** Persisted, versioned score breakdown for one issue at one point in time. */
export const ScoreBreakdown = z
  .strictObject({
    id: Uuid,
    issueId: Uuid,
    formulaVersion: z.string().min(1).max(32),
    totalScore: Points,
    /** Sum of caps for KNOWN components: the maximum achievable from measured inputs. */
    knownCapTotal: Points,
    computedAt: UtcInstant,
    components: z.array(ScoreComponent).min(1).max(RiskFactor.options.length),
  })
  .superRefine((s, ctx) => {
    const factors = new Set(s.components.map((c) => c.factor));
    if (factors.size !== s.components.length) {
      ctx.addIssue({ code: "custom", path: ["components"], message: "duplicate factor" });
    }
    const capSum = s.components.reduce((sum, c) => sum + c.cap, 0);
    if (capSum > 100 + 1e-9) {
      ctx.addIssue({ code: "custom", path: ["components"], message: "component caps sum to more than 100" });
    }
  });
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;
