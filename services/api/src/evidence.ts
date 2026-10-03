import type { EvidenceAccess } from "@astig/contracts";

/**
 * Produces a short-lived, read-only URL for a private evidence object. The S3 implementation
 * (presigned GET) is added with the evidence bucket; until then no signer is configured and the
 * API reports evidence as explicitly UNAVAILABLE instead of exposing keys or public URLs.
 */
export interface EvidenceUrlSigner {
  sign(objectKey: string): Promise<{ url: string; expiresAt: string }>;
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
