# AWS infrastructure (CDK, TypeScript)

**Deployed (2026-10-04), dev account, `ap-southeast-1`:** `CDKToolkit`, `Astig-dev-Evidence`, `Astig-dev-App`. Deploys use the account owner's IAM Identity Center login (`aws sso login --profile astig`); no long-lived access keys exist. Expected cost is about **$1.05/day (~$31/month)** while the database runs, plus $24/month for one QuickSight Author once subscribed. The budget alert is at $60/month.

## Endpoints for clients (not secrets)

| Value | |
| --- | --- |
| API base URL | `https://2jpf5wobhl.execute-api.ap-southeast-1.amazonaws.com` |
| Cognito user pool ID | `ap-southeast-1_uYQoBKBkj` |
| Cognito app client ID (public, no secret; SRP or USER_PASSWORD auth) | `7dgk8feqomk5d5q0vr81fp7m86` |
| Allowed browser origins (CORS, API + S3 PUT) | `http://localhost:5173`, `http://localhost:4173`. Set with `-c webOrigins=https://<app>.vercel.app,http://localhost:5173` and redeploy `--all` |

Send `Authorization: Bearer <Cognito access or ID token>`. Roles come from Cognito groups `OFFICER` and `OPERATOR`. Self sign-up is off, so the account owner creates users.

## What is deployed

`Astig-dev-Evidence` (`lib/evidence-stack.ts`) holds the private evidence bucket:
- Public access is fully blocked, encryption is SSE-S3, and only HTTPS requests are allowed.
- Images expire after 30 days.
- The bucket is retained if the stack is deleted.

`Astig-dev-App` (`lib/app-stack.ts`) is shaped to keep costs down:

| Piece | Design |
| --- | --- |
| Network | VPC with 2 isolated subnets only. **No NAT gateway, internet gateway, or public IP.** S3 gateway endpoint (free); one Secrets Manager interface endpoint in one AZ |
| Database | RDS PostgreSQL 17.11 + PostGIS 3.5, `db.t4g.micro`, 20 GB gp3, single-AZ, encrypted, **not public**. Port 5432 is reachable only from the VPC Lambda security group. TLS is verified using the runtime CA bundle |
| Secrets | RDS-managed master secret, plus `VisionProviderApiKey`, a placeholder for the worker owner to set in the console |
| Auth | Cognito user pool (Lite plan, no self sign-up), groups `OFFICER`/`OPERATOR`. HTTP API JWT authorizer on all routes except the CORS-preflight-only `OPTIONS` route. Throttled to 20 req/s, burst 40 |
| Lambdas (Node 22, arm64, 7-day logs) | `Api`, `Persist`, `Admin` run inside the VPC. `Ingest` runs outside the VPC so it can reach the vision provider, and calls `Persist` for database writes |
| Processing trigger | S3 `ObjectCreated` on `sessions/*.jpg` â†’ `Ingest` â†’ `Persist` |
| Analytics | `AnalyticsExport` Lambda (in the VPC; runs every 15 min via EventBridge, or on demand) writes aggregate CSVs and QuickSight manifests to a **separate private analytics bucket** (`AnalyticsBucketName` output): `analytics/manifests/issues.json`, `analytics/manifests/sessions.json`. No images, free text, or user identifiers. |

## Amazon QuickSight (executive analytics)

QuickSight reads only the analytics bucket, never the evidence bucket or the database. The manifests are `s3://<AnalyticsBucketName>/analytics/manifests/issues.json` and `.../sessions.json`.

- **Set up (2026-10-04):**
  - Enterprise account.
  - User role set to `ADMIN`, not `ADMIN_PRO`.
  - S3 access granted to the analytics bucket only.
  - Data sources `astig-issues-s3` and `astig-sessions-s3`.
  - SPICE datasets `ASTIG issues` and `ASTIG sessions`, with typed columns and latitude/longitude geo-tagged; the first import took 3 rows each, 0 dropped.
- **Refresh from the CLI:** `aws quicksight create-ingestion --aws-account-id <id> --data-set-id astig-issues --ingestion-id <unique>`; same for `astig-sessions`.

- **Cost:** 1 Author at $24/month.
- **Avoid the $250/month fee:** don't create Pro users, and don't enable Q&A (topics or dashboard Q&A).
- **Demo refresh:** after a work-order change, invoke `AnalyticsExportFunctionName` (or wait up to 15 minutes), then click **Refresh now** on the QuickSight dataset.
- **Cleanup:** cancel the QuickSight subscription after judging.

## Operating it (owner)

Run from `infra/aws` with Node 24 after `aws sso login --profile astig` (sessions last 8 hours):

```text
set AWS_PROFILE=astig
npx cdk diff  -c account=<id> -c region=ap-southeast-1      # preview
npx cdk deploy --all -c account=<id> -c region=ap-southeast-1
```

The database is private, so schema and data operations go through the admin Lambda (name in the stack output `AdminFunctionName`). Payloads: `{"action":"migrate"}`, `{"action":"seed"}`, `{"action":"status"}`, `{"action":"load-ncr-cities"}` (17 OSM city boundaries, ODbL), `{"action":"register-device","label":"Team phone 1"}` and `register-vehicle` (add `"isSynthetic":true` for demo/replay equipment). Labels are equipment names, never people's names. There's no reset action on purpose.

```text
aws lambda invoke --function-name <AdminFunctionName> --payload fileb://payload.json out.json
```

Create an officer (PowerShell; Cognito emails a temporary password):

```text
aws cognito-idp admin-create-user --user-pool-id ap-southeast-1_uYQoBKBkj --username <name> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true
aws cognito-idp admin-add-user-to-group --user-pool-id ap-southeast-1_uYQoBKBkj --username <name> --group-name OFFICER
```

**Save money:** stop the database when nobody is working (`aws rds stop-db-instance --db-instance-identifier <id>`); only storage is billed (~$0.09/day). AWS restarts it automatically after 7 days. Start it with `start-db-instance` about 5 minutes before you need it.

## Verified after deploy (2026-10-04)

- Migrations applied and synthetic seed loaded. `status` shows migrations `0001` and PostGIS 3.5.6.
- Login: a request without a token gets `401`. With a Cognito token, `GET /issues/{seed}` returns `200`, score 42.25, evidence `AVAILABLE` (presigned).
- Capture path: `POST /sessions` â†’ `201`; register observation â†’ `201 PENDING`; `POST /upload-url` â†’ presigned PUT.
- S3 rejects a PUT with the wrong length (`403`) and accepts the correct one (`200`).
- The worker recorded the uploaded image as `FAILED: PROVIDER_NOT_CONFIGURED`. This is the expected honest result until a vision provider is connected.
- An invalid work-order transition returns `409`. CORS preflight from `localhost:5173` returns `204` with allow-origin; a foreign origin gets no allow-origin header.
- The temporary smoke-test user was deleted.

## Known limitations

- The Lambdas use the RDS master user. A least-privilege app role is a follow-up.
- **Lambda concurrency limit: 10** (new-account limit; the standard default is 1000, and Service Quotas only accepts requests above 1000). AWS usually raises it automatically as the account is used. If throttling alarms fire, open an AWS Support case under Service limit increase for Lambda concurrent executions (free on Basic support).
- **Alarms:** 8 CloudWatch alarms go to an SNS topic: processing failures (3 or more in 5 min), errors and throttles for Api, Ingest and Persist, and API 5xx. Deploy with `-c alarmEmail=<email>` and **confirm the subscription email** AWS sends.
- Vision provider: `VISION_PROVIDER=gemini` (model `gemini-3.1-flash-lite`, override with `-c geminiModel=...`). Until the `VisionProviderApiKey` secret holds a real key, every image fails with `PROVIDER_NOT_CONFIGURED`. See `docs/operations/dashcam-demo-data.md` step 1.

## Teardown (after judging)

1. `npx cdk destroy Astig-dev-App`. This deletes the database without a snapshot; the data is synthetic and can be re-seeded. Empty the analytics bucket first. Cancel QuickSight separately.
2. Empty and delete the evidence bucket (it is retained by design), then `npx cdk destroy Astig-dev-Evidence`.
3. Delete the `CDKToolkit` stack in CloudFormation, if nothing else uses it.

## Local checks (no AWS access needed)

`npm test` includes CDK assertion tests: no NAT, private DB, one interface endpoint, JWT on every non-preflight route, and ingest outside the VPC. The app refuses to synthesize without explicit `-c account=` and `-c region=`.
