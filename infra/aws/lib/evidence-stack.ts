import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

export interface EvidenceStackProps extends StackProps {
  /** e.g. "dev". Used in names/tags only. */
  stage: string;
  /** Days before evidence objects are deleted. Retention is a team/privacy decision; keep it short for the hackathon. */
  evidenceRetentionDays: number;
  /** Browser origins allowed to PUT via presigned URLs (web/mobile dev). Empty = no CORS. */
  uploadCorsOrigins: string[];
}

/**
 * Smallest useful first deployment: a private, encrypted S3 bucket for image evidence.
 * Deliberately excludes RDS, VPC/NAT, Lambda, and API Gateway until connectivity and cost are agreed.
 * Expected cost at hackathon scale: S3 storage/requests only (cents/month for a few hundred demo images);
 * confirm with the AWS Pricing Calculator for your region.
 */
export class EvidenceStack extends Stack {
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: EvidenceStackProps) {
    super(scope, id, props);
    if (!Number.isInteger(props.evidenceRetentionDays) || props.evidenceRetentionDays < 1) {
      throw new Error("evidenceRetentionDays must be a positive integer");
    }

    this.bucket = new s3.Bucket(this, "EvidenceBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      // Keep data if the stack is deleted by mistake; empty and delete the bucket deliberately at cleanup.
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { id: "expire-evidence", expiration: Duration.days(props.evidenceRetentionDays) },
        { id: "abort-incomplete-uploads", abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
      cors: props.uploadCorsOrigins.length
        ? [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: props.uploadCorsOrigins, allowedHeaders: ["content-type"], maxAge: 300 }]
        : undefined,
    });

    Tags.of(this).add("project", "astig");
    Tags.of(this).add("stage", props.stage);
    Tags.of(this).add("data-classification", "restricted-evidence");

    new CfnOutput(this, "EvidenceBucketName", { value: this.bucket.bucketName });
  }
}
