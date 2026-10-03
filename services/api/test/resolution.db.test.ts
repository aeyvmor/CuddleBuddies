import { IssueDetailResponse, ResolutionEvidenceResponse } from "@astig/contracts";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_ISSUES } from "../../../database/seeds/synthetic-demo";
import { resetAndSeed, testDatabaseUrl } from "../../../database/test/helpers";
import { markResolutionUploaded } from "../../worker/src/processing";
import { createApp } from "../src/app";
import type { EvidenceUploadSigner, EvidenceUrlSigner } from "../src/evidence";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const officer = { "x-astig-dev-subject": "demo-officer-01", "x-astig-dev-roles": "OFFICER" };
const WO_OPEN = "5e3d0008-0000-4000-8000-000000000001"; // issue I2
const WO_RESOLVED = "5e3d0008-0000-4000-8000-000000000002"; // issue I3
const EVID = "0b6f1d4e-6a3c-4c1e-9d2a-7f00000000e1";

const signedKeys: string[] = [];
const signer: EvidenceUploadSigner & EvidenceUrlSigner = {
  signUpload: async ({ objectKey }) => (signedKeys.push(objectKey), { url: "https://bucket.example.test/put?sig=1", expiresAt: "2026-10-04T00:05:00.000Z" }),
  sign: async () => ({ url: "https://bucket.example.test/get?sig=1", expiresAt: "2026-10-04T00:05:00.000Z" }),
};
const app = createApp({ pool, authMode: "local-dev", evidenceSigner: signer, uploadSigner: signer, log: () => undefined });
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app({ method, path, headers: officer, body: body === undefined ? null : JSON.stringify(body), requestId: "t" });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
const req = (over: Record<string, unknown> = {}) => ({ clientEvidenceId: EVID, contentType: "image/jpeg", contentLengthBytes: 4096, note: "SYNTHETIC: grate cleared", ...over });

beforeEach(async () => {
  signedKeys.length = 0;
  const c = await pool.connect();
  try {
    await resetAndSeed(c);
  } finally {
    c.release();
  }
});
afterAll(() => pool.end());

describe("POST /work-orders/{id}/resolution-evidence", () => {
  it("attaches an after-image to a RESOLVED work order with a server-derived key, idempotently", async () => {
    const first = await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req());
    expect(first.status).toBe(201);
    const body = ResolutionEvidenceResponse.parse(first.body);
    expect(body.evidence).toMatchObject({ workOrderId: WO_RESOLVED, status: "PENDING_UPLOAD", note: "SYNTHETIC: grate cleared" });
    expect(body.upload).toMatchObject({ method: "PUT", headers: { "content-type": "image/jpeg", "content-length": "4096" } });
    expect(signedKeys).toEqual([`work-orders/${WO_RESOLVED}/resolution/${EVID}.jpg`]);
    expect(JSON.stringify(first.body)).not.toContain("work-orders/");

    const replay = await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req());
    expect(replay.status).toBe(200);
    expect(replay.body.evidence.id).toBe(body.evidence.id);
    const conflict = await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req({ note: "different" }));
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("is refused while the work order is still OPEN, and for unknown work orders", async () => {
    expect((await call("POST", `/work-orders/${WO_OPEN}/resolution-evidence`, req())).body.error.code).toBe("INVALID_TRANSITION");
    expect((await call("POST", "/work-orders/5e3d0008-0000-4000-8000-0000000000ff/resolution-evidence", req())).status).toBe(404);
    expect((await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req({ contentType: "image/png" }))).status).toBe(400);
  });

  it("worker marks the upload once; issue detail then shows a signed URL and upload becomes null", async () => {
    await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req());
    const key = `work-orders/${WO_RESOLVED}/resolution/${EVID}.jpg`;
    const c = await pool.connect();
    try {
      expect(await markResolutionUploaded(c, key)).toEqual({ marked: true });
      expect(await markResolutionUploaded(c, key)).toEqual({ marked: false, reason: "ALREADY_MARKED" });
      expect(await markResolutionUploaded(c, `work-orders/${WO_RESOLVED}/resolution/0b6f1d4e-6a3c-4c1e-9d2a-7f00000000ff.jpg`)).toEqual({ marked: false, reason: "UNKNOWN_OBJECT" });
    } finally {
      c.release();
    }
    const again = await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req());
    expect(again.body).toMatchObject({ created: false, upload: null, evidence: { status: "UPLOADED" } });

    const detail = IssueDetailResponse.parse((await call("GET", `/issues/${SEED_ISSUES[2]!.id}`)).body);
    expect(detail.resolutionEvidence).toHaveLength(1);
    expect(detail.resolutionEvidence![0]!.evidence).toMatchObject({ status: "AVAILABLE" });
  });

  it("caps evidence per work order", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req({ clientEvidenceId: `0b6f1d4e-6a3c-4c1e-9d2a-7f00000001a${i}` }))).status).toBe(201);
    }
    expect((await call("POST", `/work-orders/${WO_RESOLVED}/resolution-evidence`, req({ clientEvidenceId: "0b6f1d4e-6a3c-4c1e-9d2a-7f00000001b0" }))).status).toBe(400);
  });
});
