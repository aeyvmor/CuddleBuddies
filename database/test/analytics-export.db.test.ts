import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { csvValue, exportAnalytics, quickSightManifest, toCsv } from "../src/analytics-export";
import { resetAndSeed, testDatabaseUrl } from "./helpers";

const client = new pg.Client({ connectionString: testDatabaseUrl() });
beforeAll(async () => {
  await client.connect();
  await resetAndSeed(client);
});
afterAll(() => client.end());

describe("CSV helpers", () => {
  it("quotes, escapes, and neutralizes spreadsheet formulas", () => {
    expect(csvValue('a "b", c')).toBe('"a ""b"", c"');
    expect(csvValue("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvValue(-12.5)).toBe("-12.5");
    expect(csvValue(null)).toBe("");
    expect(csvValue(new Date("2026-10-03T00:00:00Z"))).toBe("2026-10-03T00:00:00.000Z");
    expect(toCsv(["a", "b"], [{ a: 1, b: "x" }])).toBe("a,b\r\n1,x\r\n");
  });

  it("builds a QuickSight manifest pointing at the CSV", () => {
    expect(JSON.parse(quickSightManifest("bkt", "analytics/issues/issues.csv"))).toEqual({
      fileLocations: [{ URIs: ["s3://bkt/analytics/issues/issues.csv"] }],
      globalUploadSettings: { format: "CSV", delimiter: ",", textqualifier: '"', containsHeader: "true" },
    });
  });
});

describe("exportAnalytics", () => {
  it("writes aggregate datasets without image keys, free text, or user identifiers", async () => {
    const written = new Map<string, string>();
    const result = await exportAnalytics(client, "bkt", { put: async (k, b) => void written.set(k, b) }, new Date("2026-10-04T00:00:00Z"));
    expect(result.map((r) => [r.dataset, r.rows])).toEqual([["issues", 3], ["sessions", 2]]);
    expect([...written.keys()].sort()).toEqual([
      "analytics/issues/issues.csv",
      "analytics/manifests/issues.json",
      "analytics/manifests/sessions.json",
      "analytics/sessions/sessions.csv",
    ]);
    const issues = written.get("analytics/issues/issues.csv")!;
    expect(issues.split("\r\n")[0]).toContain("max_severity");
    expect(issues).toContain("2026-10-04T00:00:00.000Z");
    const all = [...written.values()].join("\n");
    expect(all).not.toContain("sessions/5e3d"); // no S3 object keys
    expect(all).not.toContain("SYNTHETIC:"); // no free-text evidence descriptions/notes
    expect(all).not.toContain("demo-operator"); // no user subjects
  });
});
