import {
  RISK_FORMULA_VERSION,
  RiskFactor,
  type ScoreComponent,
  type SeverityEstimate,
} from "@astig/contracts";

/**
 * Prototype, explainable 0–100 priority score. Weights are demonstration assumptions,
 * NOT scientifically calibrated flood-risk coefficients.
 */
export interface RiskFactorConfig {
  /** Multiplier applied to the 0–100 normalized input. */
  weight: number;
  /** Maximum points this factor can contribute. */
  cap: number;
}

export interface RiskFormulaConfig {
  formulaVersion: string;
  factors: Record<RiskFactor, RiskFactorConfig>;
}

export const RISK_V0_CONFIG: Readonly<RiskFormulaConfig> = Object.freeze({
  formulaVersion: RISK_FORMULA_VERSION,
  factors: Object.freeze({
    SEVERITY: { weight: 0.35, cap: 35 },
    WEATHER: { weight: 0.25, cap: 25 },
    RECURRENCE: { weight: 0.2, cap: 20 },
    HAZARD: { weight: 0.1, cap: 10 },
    EXPOSURE: { weight: 0.1, cap: 10 },
  }),
});

export type RiskInput =
  | { status: "KNOWN"; normalizedValue: number; source: string | null; rationale: string }
  | { status: "UNKNOWN"; source: string | null; rationale: string };

export type RiskInputs = Record<RiskFactor, RiskInput>;

export interface RiskScoreResult {
  formulaVersion: string;
  totalScore: number;
  knownCapTotal: number;
  components: ScoreComponent[];
}

export class RiskScoreError extends Error {
  override readonly name = "RiskScoreError";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function validateRiskConfig(config: RiskFormulaConfig): void {
  if (!config.formulaVersion) throw new RiskScoreError("formulaVersion is required");
  let capSum = 0;
  for (const factor of RiskFactor.options) {
    const f = config.factors[factor];
    if (!f) throw new RiskScoreError(`missing config for factor ${factor}`);
    if (!Number.isFinite(f.weight) || f.weight < 0 || f.weight > 1) {
      throw new RiskScoreError(`weight for ${factor} must be within [0,1]`);
    }
    if (!Number.isFinite(f.cap) || f.cap < 0 || f.cap > 100) {
      throw new RiskScoreError(`cap for ${factor} must be within [0,100]`);
    }
    capSum += f.cap;
  }
  if (capSum > 100 + 1e-9) {
    throw new RiskScoreError(`factor caps sum to ${capSum}; must not exceed 100`);
  }
}

/**
 * Computes the score. Each KNOWN input must be a finite value in [0,100]; invalid inputs throw
 * rather than being clamped, so bad enrichment data is visible. UNKNOWN inputs contribute no points
 * and are reported separately (knownCapTotal) so "unknown" is never presented as "zero risk".
 */
export function computeRiskScore(inputs: RiskInputs, config: RiskFormulaConfig = RISK_V0_CONFIG): RiskScoreResult {
  validateRiskConfig(config);

  const components: ScoreComponent[] = RiskFactor.options.map((factor) => {
    const input = inputs[factor];
    const { weight, cap } = config.factors[factor];
    if (!input) throw new RiskScoreError(`missing input for factor ${factor}; pass UNKNOWN explicitly`);
    if (input.status === "UNKNOWN") {
      return { factor, weight, cap, inputStatus: "UNKNOWN", normalizedValue: null, weightedPoints: null, source: input.source, rationale: input.rationale };
    }
    const v = input.normalizedValue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
      throw new RiskScoreError(`normalized value for ${factor} must be a finite number within [0,100]`);
    }
    const weightedPoints = round2(Math.min(v * weight, cap));
    return { factor, weight, cap, inputStatus: "KNOWN", normalizedValue: v, weightedPoints, source: input.source, rationale: input.rationale };
  });

  const totalScore = round2(components.reduce((s, c) => s + (c.weightedPoints ?? 0), 0));
  const knownCapTotal = round2(components.reduce((s, c) => s + (c.inputStatus === "KNOWN" ? c.cap : 0), 0));
  // Defensive invariant; unreachable when caps sum to <= 100.
  if (totalScore < 0 || totalScore > 100) throw new RiskScoreError(`total score ${totalScore} out of range`);

  return { formulaVersion: config.formulaVersion, totalScore, knownCapTotal, components };
}

/** Severity normalization for risk.v0. */
export const SEVERITY_NORMALIZED: Readonly<Record<SeverityEstimate, number>> = Object.freeze({
  NONE: 0,
  LOW: 25,
  MODERATE: 50,
  HIGH: 75,
  CRITICAL: 100,
});

export function normalizeSeverity(severity: SeverityEstimate): number {
  return SEVERITY_NORMALIZED[severity];
}

/** Recurrence normalization for risk.v0: first sighting = 0, each repeat +25, capped at 100. */
export function normalizeRecurrence(observationCount: number): number {
  if (!Number.isInteger(observationCount) || observationCount < 1) {
    throw new RiskScoreError("observationCount must be an integer >= 1");
  }
  return Math.min(100, (observationCount - 1) * 25);
}
