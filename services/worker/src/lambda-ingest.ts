import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { createIngestHandler, type S3Event } from "./ingest";
import { providerFromEnv } from "./provider";

// Ingest Lambda (outside the VPC): S3 ObjectCreated → vision provider → persist Lambda.
const s3 = new S3Client({});
const lambda = new LambdaClient({});
const persistFunctionName = process.env.PERSIST_FUNCTION_NAME;
if (!persistFunctionName) throw new Error("PERSIST_FUNCTION_NAME is required");

const ingest = createIngestHandler({
  provider: providerFromEnv(),
  readObject: async (bucket, key) => {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) throw new Error("empty object body");
    return { bytes: await res.Body.transformToByteArray(), contentType: res.ContentType ?? "application/octet-stream" };
  },
  persist: async (request) => {
    const res = await lambda.send(new InvokeCommand({ FunctionName: persistFunctionName, Payload: Buffer.from(JSON.stringify(request)) }));
    const text = res.Payload ? Buffer.from(res.Payload).toString("utf8") : "";
    if (res.FunctionError) throw new Error(`persist function error: ${res.FunctionError} ${text.slice(0, 300)}`);
    return JSON.parse(text);
  },
});

export const handler = (event: S3Event) => ingest(event);
