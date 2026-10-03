import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type pg from "pg";
import { exportAnalytics } from "../src/analytics-export";
import { createPoolFromEnv } from "../src/pool";

/**
 * Scheduled (EventBridge, every 15 min) and on-demand analytics export to the private analytics
 * bucket, read by Amazon QuickSight. Runs in the VPC; reaches S3 through the gateway endpoint.
 */
const s3 = new S3Client({});
let poolPromise: Promise<pg.Pool> | undefined;

export async function handler() {
  const bucket = process.env.ANALYTICS_BUCKET;
  if (!bucket) throw new Error("ANALYTICS_BUCKET is required");
  poolPromise ??= createPoolFromEnv({ max: 1 }).catch((err) => {
    poolPromise = undefined;
    throw err;
  });
  const pool = await poolPromise;
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await exportAnalytics(client, bucket, {
      put: async (key, body, contentType) => {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      },
    });
    await client.query("COMMIT");
    console.log(JSON.stringify({ level: "info", msg: "analytics exported", result }));
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
