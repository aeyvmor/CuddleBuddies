import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GeminiProvider } from "./gemini";
import { createIngestHandler, type S3Event } from "./ingest";
import { providerFromEnv } from "./provider";

// Ingest Lambda (outside the VPC): S3 ObjectCreated → vision provider → persist Lambda.
const s3 = new S3Client({});
const lambda = new LambdaClient({});
const sm = new SecretsManagerClient({});
const persistFunctionName = process.env.PERSIST_FUNCTION_NAME;
if (!persistFunctionName) throw new Error("PERSIST_FUNCTION_NAME is required");

// Cache the key briefly so a key rotated in the console takes effect within minutes.
let cachedKey: { value: string; at: number } | undefined;
async function visionApiKey(): Promise<string> {
  if (cachedKey && Date.now() - cachedKey.at < 5 * 60_000) return cachedKey.value;
  const arn = process.env.VISION_SECRET_ARN;
  if (!arn) return "NOT_CONFIGURED";
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = (res.SecretString ?? "").trim();
  cachedKey = { value, at: Date.now() };
  return value;
}

const ingest = createIngestHandler({
  provider: providerFromEnv(process.env, {
    gemini: () => new GeminiProvider({ getApiKey: visionApiKey, model: process.env.GEMINI_MODEL || undefined }),
  }),
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
