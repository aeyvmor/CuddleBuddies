import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { EvidenceStack } from "../lib/evidence-stack";

const synth = (origins: string[] = []) =>
  Template.fromStack(
    new EvidenceStack(new App(), "Test", {
      env: { account: "111111111111", region: "ap-southeast-1" },
      stage: "test",
      evidenceRetentionDays: 30,
      uploadCorsOrigins: origins,
    }),
  );

describe("EvidenceStack", () => {
  it("creates exactly one private, encrypted, retained bucket", () => {
    const t = synth();
    t.resourceCountIs("AWS::S3::Bucket", 1);
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
      OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
      LifecycleConfiguration: { Rules: Match.arrayWith([Match.objectLike({ ExpirationInDays: 30, Status: "Enabled" })]) },
    });
    t.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain" });
  });

  it("denies non-TLS access", () => {
    synth().hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } }),
        ]),
      },
    });
  });

  it("adds no CORS unless origins are configured, and only PUT when they are", () => {
    const none = synth().findResources("AWS::S3::Bucket");
    expect(Object.values(none)[0]?.Properties?.CorsConfiguration).toBeUndefined();
    synth(["http://localhost:5173"]).hasResourceProperties("AWS::S3::Bucket", {
      CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedMethods: ["PUT"], AllowedOrigins: ["http://localhost:5173"] })] },
    });
  });

  it("contains no billable compute, database, or network resources", () => {
    const types = Object.values(synth().toJSON().Resources as Record<string, { Type: string }>).map((r) => r.Type);
    expect(types.sort()).toEqual(["AWS::S3::Bucket", "AWS::S3::BucketPolicy"]);
  });
});
