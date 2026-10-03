import { App } from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack";
import { EvidenceStack } from "../lib/evidence-stack";

// Account and region must be passed explicitly so a synth/deploy can never silently target
// whatever credentials happen to be active:
//   npx cdk synth -c account=123456789012 -c region=ap-southeast-1
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

const evidence = new EvidenceStack(app, `Astig-${stage}-Evidence`, {
  env,
  stage,
  evidenceRetentionDays: Number(app.node.tryGetContext("evidenceRetentionDays") ?? 30),
  uploadCorsOrigins: list("uploadCorsOrigins"),
});

new AppStack(app, `Astig-${stage}-App`, {
  env,
  stage,
  evidenceBucketName: evidence.bucket.bucketName,
  evidenceBucketArn: evidence.bucket.bucketArn,
  apiCorsOrigins: list("apiCorsOrigins", "http://localhost:5173"),
});
