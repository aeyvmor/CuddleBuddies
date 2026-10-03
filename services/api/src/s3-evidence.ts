import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UPLOAD_URL_TTL_SECONDS } from "@astig/contracts";
import type { EvidenceUploadSigner, EvidenceUrlSigner } from "./evidence";

export const EVIDENCE_READ_TTL_SECONDS = 300;

/**
 * Presigns S3 requests locally (no network call), so it works from a VPC Lambda without
 * internet access. Upload URLs sign content-type and content-length, so S3 rejects any PUT
 * whose type or exact size differs from what the API authorized.
 */
export class S3EvidenceStorage implements EvidenceUrlSigner, EvidenceUploadSigner {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client = new S3Client({}),
    private readonly now: () => number = Date.now,
  ) {}

  async sign(objectKey: string): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), {
      expiresIn: EVIDENCE_READ_TTL_SECONDS,
    });
    return { url, expiresAt: new Date(this.now() + EVIDENCE_READ_TTL_SECONDS * 1000).toISOString() };
  }

  async signUpload(params: { objectKey: string; contentType: "image/jpeg"; contentLengthBytes: number }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.objectKey,
      ContentType: params.contentType,
      ContentLength: params.contentLengthBytes,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return { url, expiresAt: new Date(this.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString() };
  }
}
