import { App } from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack";
import { EvidenceStack } from "../lib/evidence-stack";

// Account and region must be passed explicitly so a synth/deploy can never silently target
// whatever credentials happen to be active:
//   npx cdk deploy --all -c account=123456789012 -c region=ap-southeast-1 \
//     [-c webOrigins=https://astig.vercel.app,http://localhost:5173] [-c alarmEmail=you@example.com]
const app = new App();
const account = app.node.tryGetContext("account");
const region = app.node.tryGetContext("region");
if (!/^\d{12}$/.test(String(account ?? "")) || !/^[a-z]{2}(-[a-z]+)+-\d$/.test(String(region ?? ""))) {
  throw new Error("Pass the approved target explicitly: -c account=<12-digit id> -c region=<e.g. ap-southeast-1>");
}
const env = { account, region };
const stage = String(app.node.tryGetContext("stage") ?? "dev");
const list = (key: string, fallback = "") =>
  String(app.node.tryGetContext(key) ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Browser origins of the web dashboard: API CORS and direct-to-S3 uploads (resolution images).
// Exact origins only (scheme + host + port, no trailing slash). Add the Vercel URL when it exists.
const LOCAL_WEB = "http://localhost:5173,http://localhost:4173";
const webOrigins = list("webOrigins", LOCAL_WEB);
for (const o of webOrigins) {
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) throw new Error(`invalid web origin "${o}" (use e.g. https://astig.vercel.app)`);
}

const evidence = new EvidenceStack(app, `Astig-${stage}-Evidence`, {
  env,
  stage,
  evidenceRetentionDays: Number(app.node.tryGetContext("evidenceRetentionDays") ?? 30),
  uploadCorsOrigins: webOrigins,
});

new AppStack(app, `Astig-${stage}-App`, {
  env,
  stage,
  evidenceBucketName: evidence.bucket.bucketName,
  evidenceBucketArn: evidence.bucket.bucketArn,
  apiCorsOrigins: webOrigins,
  alarmEmail: app.node.tryGetContext("alarmEmail") || undefined,
});
