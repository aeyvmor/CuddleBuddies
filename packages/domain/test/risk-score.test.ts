import { describe, expect, it } from "vitest";
import { ScoreBreakdown } from "@astig/contracts";
import {
  RISK_V0_CONFIG,
  RiskScoreError,
  computeRiskScore,
  normalizeRecurrence,
  normalizeSeverity,
  validateRiskConfig,
  type RiskFormulaConfig,
  type RiskInputs,
} from "../src";

const known = (normalizedValue: number) => ({ status: "KNOWN" as const, normalizedValue, source: "test", rationale: "test input" });
const unknown = { status: "UNKNOWN" as const, source: null, rationale: "feed not configured" };

const allKnown = (v: number): RiskInputs => ({
  SEVERITY: known(v),
  WEATHER: known(v),
  RECURRENCE: known(v),
  HAZARD: known(v),
  EXPOSURE: known(v),
});

describe("computeRiskScore", () => {
  it("prototype caps sum to exactly 100", () => {
    const sum = Object.values(RISK_V0_CONFIG.factors).reduce((s, f) => s + f.cap, 0);
    expect(sum).toBe(100);
  });

  it("all inputs at maximum scores exactly 100 with each component at its cap", () => {
    const r = computeRiskScore(allKnown(100));
    expect(r.totalScore).toBe(100);
    expect(r.knownCapTotal).toBe(100);
    for (const c of r.components) expect(c.weightedPoints).toBe(c.cap);
  });

  it("all inputs at zero scores 0 (measured zero risk)", () => {
    const r = computeRiskScore(allKnown(0));
    expect(r.totalScore).toBe(0);
    expect(r.knownCapTotal).toBe(100);
  });

  it("caps a weighted component even when weight × value exceeds the cap", () => {
    const config: RiskFormulaConfig = {
      formulaVersion: "test",
      factors: { ...RISK_V0_CONFIG.factors, SEVERITY: { weight: 0.5, cap: 35 } },
    };
    const r = computeRiskScore(allKnown(100), config);
    expect(r.components.find((c) => c.factor === "SEVERITY")?.weightedPoints).toBe(35);
    expect(r.totalScore).toBe(100);
  });

  it("treats unknown inputs as unknown, not zero", () => {
    const r = computeRiskScore({ ...allKnown(100), WEATHER: unknown, HAZARD: unknown });
    const weather = r.components.find((c) => c.factor === "WEATHER");
    expect(weather).toMatchObject({ inputStatus: "UNKNOWN", normalizedValue: null, weightedPoints: null });
    expect(r.totalScore).toBe(65);
    expect(r.knownCapTotal).toBe(65);
  });

  it("all-unknown inputs yield total 0 with knownCapTotal 0, distinguishable from measured zero", () => {
    const r = computeRiskScore({ SEVERITY: unknown, WEATHER: unknown, RECURRENCE: unknown, HAZARD: unknown, EXPOSURE: unknown });
    expect(r.totalScore).toBe(0);
    expect(r.knownCapTotal).toBe(0);
    expect(r.components.every((c) => c.inputStatus === "UNKNOWN")).toBe(true);
  });

  it("computes a representative mixed score", () => {
    // severity HIGH (75) → 26.25, recurrence 3 obs (50) → 10, exposure 40 → 4, weather/hazard unknown
    const r = computeRiskScore({ SEVERITY: known(75), WEATHER: unknown, RECURRENCE: known(50), HAZARD: unknown, EXPOSURE: known(40) });
    expect(r.totalScore).toBe(40.25);
    expect(r.knownCapTotal).toBe(65);
    expect(r.formulaVersion).toBe("risk.v0");
  });

  it("produces output valid against the shared ScoreBreakdown contract", () => {
    const r = computeRiskScore({ ...allKnown(33.333), WEATHER: unknown });
    const parsed = ScoreBreakdown.safeParse({
      ...r,
      id: "00000000-0000-4000-8000-000000000001",
      issueId: "00000000-0000-4000-8000-000000000002",
      computedAt: "2026-10-03T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it.each([[-0.01], [100.01], [Number.NaN], [Number.POSITIVE_INFINITY]])("rejects out-of-range input %s instead of clamping", (v) => {
    expect(() => computeRiskScore({ ...allKnown(50), SEVERITY: known(v) })).toThrow(RiskScoreError);
  });

  it("rejects a missing factor (must be explicitly UNKNOWN)", () => {
    const { HAZARD: _omit, ...partial } = allKnown(50);
    expect(() => computeRiskScore(partial as RiskInputs)).toThrow(/HAZARD/);
  });
});

describe("validateRiskConfig", () => {
  it("rejects caps that sum above 100", () => {
    const config: RiskFormulaConfig = {
      formulaVersion: "bad",
      factors: { ...RISK_V0_CONFIG.factors, HAZARD: { weight: 0.1, cap: 11 } },
    };
    expect(() => validateRiskConfig(config)).toThrow(/must not exceed 100/);
  });

  it("rejects weights outside [0,1]", () => {
    const config: RiskFormulaConfig = {
      formulaVersion: "bad",
      factors: { ...RISK_V0_CONFIG.factors, HAZARD: { weight: 1.5, cap: 10 } },
    };
    expect(() => validateRiskConfig(config)).toThrow(RiskScoreError);
  });
});

describe("normalizers", () => {
  it("maps severity to fixed values", () => {
    expect(normalizeSeverity("NONE")).toBe(0);
    expect(normalizeSeverity("CRITICAL")).toBe(100);
  });

  it("caps recurrence at 100 and rejects invalid counts", () => {
    expect(normalizeRecurrence(1)).toBe(0);
    expect(normalizeRecurrence(3)).toBe(50);
    expect(normalizeRecurrence(50)).toBe(100);
    expect(() => normalizeRecurrence(0)).toThrow(RiskScoreError);
    expect(() => normalizeRecurrence(1.5)).toThrow(RiskScoreError);
  });
});
