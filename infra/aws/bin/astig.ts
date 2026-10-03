import { App } from "aws-cdk-lib";
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
const stage = String(app.node.tryGetContext("stage") ?? "dev");
const origins = String(app.node.tryGetContext("uploadCorsOrigins") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

new EvidenceStack(app, `Astig-${stage}-Evidence`, {
  env: { account, region },
  stage,
  evidenceRetentionDays: Number(app.node.tryGetContext("evidenceRetentionDays") ?? 30),
  uploadCorsOrigins: origins,
});
