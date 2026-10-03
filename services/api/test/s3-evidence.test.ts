import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3EvidenceStorage } from "../src/s3-evidence";

// Presigning is local computation; fake static credentials, no network access.
const client = new S3Client({ region: "ap-southeast-1", credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-secret" } });
const storage = new S3EvidenceStorage("astig-test-bucket", client, () => Date.parse("2026-10-03T00:00:00.000Z"));
const KEY = "sessions/5e3d0003-0000-4000-8000-000000000001/observations/5e3d0005-0000-4000-8000-000000000001.jpg";

describe("S3EvidenceStorage", () => {
  it("signs uploads with content-type and exact content-length for 5 minutes", async () => {
    const r = await storage.signUpload({ objectKey: KEY, contentType: "image/jpeg", contentLengthBytes: 12345 });
    const url = new URL(r.url);
    expect(url.hostname).toContain("astig-test-bucket");
    expect(url.pathname).toBe(`/${KEY}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(expect.arrayContaining(["content-length", "content-type", "host"]));
    expect(r.expiresAt).toBe("2026-10-03T00:05:00.000Z");
  });

  it("signs short-lived reads", async () => {
    const r = await storage.sign(KEY);
    expect(new URL(r.url).searchParams.get("X-Amz-Expires")).toBe("300");
  });
});
