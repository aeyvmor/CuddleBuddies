import { PersistRequest, type BeginResult, type CompleteResult } from "@astig/contracts";
import { createPoolFromEnv, withTransaction } from "@astig/database";
import type pg from "pg";
import { beginProcessing, completeProcessing } from "./processing";

// Persist Lambda (inside the VPC): database writes only; invoked synchronously by ingest.
let poolPromise: Promise<pg.Pool> | undefined;

export async function handler(event: unknown): Promise<BeginResult | CompleteResult> {
  const request = PersistRequest.parse(event); // internal contract, still validated
  poolPromise ??= createPoolFromEnv({ max: 2 }).catch((err) => {
    poolPromise = undefined;
    throw err;
  });
  const pool = await poolPromise;
  return withTransaction<BeginResult | CompleteResult>(pool, (c) =>
    request.action === "BEGIN" ? beginProcessing(c, request.objectKey) : completeProcessing(c, request.objectKey, request.outcome),
  );
}
