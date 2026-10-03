import type { EvidenceAccess } from "@astig/contracts";

/**
 * Short-lived access to private evidence objects. The S3 implementation lives in
 * s3-evidence.ts; when no bucket is configured (local dev) the API reports evidence as
 * explicitly UNAVAILABLE and refuses to issue upload URLs, instead of faking access.
 */
export interface EvidenceUrlSigner {
  sign(objectKey: string): Promise<{ url: string; expiresAt: string }>;
}

export interface EvidenceUploadSigner {
  signUpload(params: {
    objectKey: string;
    contentType: "image/jpeg";
    contentLengthBytes: number;
  }): Promise<{ url: string; expiresAt: string }>;
}

export async function evidenceAccess(
  signer: EvidenceUrlSigner | null,
  objectKey: string,
  uploadedAt: Date | null,
): Promise<EvidenceAccess> {
  if (uploadedAt === null) return { status: "UNAVAILABLE", reason: "NOT_UPLOADED" };
  if (signer === null) return { status: "UNAVAILABLE", reason: "SIGNER_NOT_CONFIGURED" };
  const { url, expiresAt } = await signer.sign(objectKey);
  return { status: "AVAILABLE", url, expiresAt };
}
