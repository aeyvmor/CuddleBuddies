# ASTIG pre-build setup checklist

Use this before parallel coding. The goal is to make sure all four people can run the same project, use the same contracts, and access only the development cloud resources they need.

## 1. Confirm the product boundary

- [ ] Build the single loop: capture → validated evidence → spatial issue → explainable score → officer review → work order → resolve.
- [ ] Keep AI advisory. No autonomous dispatch or flood-prediction claims.
- [ ] Use distance-based sampling (about 7 m is the prototype target); do not silently replace it with timer-only sampling.
- [ ] Pick a real Android capture, synthetic seed, or both for the demo; mark synthetic/prerecorded results clearly.
- [ ] Do not use Google Street View by default; choose team-captured, synthetic, or explicitly licensed local imagery and label it.

## 2. Stack recommendation

| Area | Recommended choice | Status / note |
| --- | --- | --- |
| Mobile | React Native for Android; Expo development build | Team preference; validate native camera/location/VIO library compatibility first. Do not assume Expo Go can load custom native modules. |
| Web | React + Vite + TypeScript | Team direction for the map-centric SPA. |
| Visual system | CSS custom properties/tokens + CSS Modules on web; typed platform tokens on mobile; accessible headless primitives | Keep colors, spacing, type, radii, and component composition adjustable by the UI designer. Avoid committing to a visually opinionated component kit before designer review. |
| Monorepo | npm workspaces | Recommended low-ceremony workspace manager; confirm Expo/Metro workspace setup during app scaffolding. |
| API + worker | TypeScript on Node.js, deployed as AWS Lambda functions behind API Gateway / S3 events | Team selected the language; choose a minimal handler structure and share contracts. |
| Contracts | Zod schemas in `packages/contracts/` | Recommended runtime validation for mobile/web/API and untrusted vision output; infer TS types from schemas. |
| Domain | Framework-independent TypeScript in `packages/domain/` | Risk score, allowed state transitions, and issue rules stay unit-testable. |
| Database | PostgreSQL + PostGIS; ordered SQL migrations and `pg` driver | Use explicit SQL for spatial operations; don't add an ORM before a specific need. |
| Local development DB | Docker Postgres with PostGIS | Avoid cloud DB dependence during daily local development. |
| AWS definitions | AWS CDK in TypeScript | Recommended to share language/tooling; bootstrap only the agreed dev account and region. |
| Vision | Gemini adapter for hackathon, subject to credentials/quota | Keep provider behind an interface; never expose the provider key to either client. |
| Maps | Select after checking the team's existing key, cost, and attribution constraints | Keep map components isolated from issue/work-order domain logic. |

## 3. Team and collaboration setup

- [ ] Name the four owners and one integration/demo lead in [team handoff](../../memory/current-state.md); one teammate owns both mobile and web, and the other two support requirements/integration.
- [ ] Create a shared issue board with P0/P1/P2 labels based on the [implementation plan](../../.kiro/specs/astig/tasks.md).
- [ ] Choose one integration branch policy; use short feature branches and merge small changes frequently.
- [ ] Agree a short contract checkpoint before client work; the client owner must implement both apps against the same API fields.
- [ ] Put decisions in [architecture decisions](../architecture/decisions.md), not only chat messages.
- [ ] Identify the UI designer's point of contact and request a first pass of tokens, type, map/detail layout, and states before styling hardens.
- [ ] Keep generated AI code under normal review: run tests, inspect permissions, check migration behavior, and verify external API usage.

### Contract freeze before splitting work

Agree and write down:

1. Observation ID/idempotency key, session/device/vehicle IDs, timestamp format, coordinate order/SRID, and horizontal accuracy.
2. Upload URL request/response and who owns object-key generation.
3. Processing status values and retry/error response shape.
4. Detection enums, confidence/blockage bounds, review flag, and schema version.
5. Issue detail and score breakdown fields, including unknown inputs.
6. Work-order statuses, legal transitions, and role allowed to initiate them.
7. Pagination, sorting, authentication, and API versioning.

## 4. Developer machine prerequisites

Install these on every machine before app scaffolding:

- Git and repository access.
- A supported Node.js LTS version and its bundled npm. Pin the chosen version in the repository (for example `.nvmrc`) when the team creates the root package manifest.
- Docker Desktop / Docker Engine and Compose for local Postgres/PostGIS.
- Android Studio, Android SDK/platform tools, and one of:
  - a physical Android phone with developer options and USB debugging enabled; or
  - a configured Android emulator with camera/location test support.
- Android platform tools on `PATH` so `adb devices` can see the test device.
- AWS CLI v2 only for team members deploying/investigating AWS resources.
- AWS CDK CLI only after the team selects CDK.
- Optional: `gh` for GitHub issue/PR flow.

Do not hard-pin Node, Android Gradle, JDK, Expo SDK, or dependency versions from a chat response. Select versions supported by the chosen Expo SDK and pin them in project config during scaffold.

### Local readiness checks

Each developer should be able to run:

```text
git --version
node --version
npm --version
docker --version
docker compose version
adb devices
```

The mobile owner should verify a local Android app can be installed on the target device before investing in native camera/VIO work.

## 5. Cloud accounts and credentials

### AWS development account

- [ ] Select one team-controlled AWS account and one region before creating resources.
- [ ] Turn on MFA for human identities. Do not share root credentials.
- [ ] Use IAM Identity Center or individually assigned least-privilege roles; never pass an administrator access key around in chat.
- [ ] Set a small budget and billing alerts before provisioning RDS, NAT, or analytics resources.
- [ ] Separate a hackathon/dev environment from production; do not put personal/real public imagery in this demo account.
- [ ] Agree who may deploy, destroy, and inspect resources; record resource owner and cleanup date.
- [ ] Store database/provider secrets in AWS Secrets Manager or the chosen local secret manager, not in code, client bundles, shell history, or Git.

### Google / model access

- [ ] Do not create a Google Maps Platform project for this MVP unless the team explicitly approves Street View and its cost/terms.
- [ ] Create model-provider credentials only if Gemini is selected; keep the key server-side and restrict its use.
- [ ] Use team-owned, synthetic, or explicitly licensed sample images for inference.

### Amazon Quick / Quick Sight

- [ ] Verify the team's AWS account/region has the required Amazon Quick/Quick Sight subscription, service access, and author permissions.
- [ ] Verify a dataset can reach the intended analytics source before making this a P0 dependency.
- [ ] If account/network setup is blocked, demonstrate the same metrics in the operations UI and label Quick/Quick Sight integration as pending; do not fake an integration.

## 6. AWS resources to prepare

### MVP resources

| Service/resource | Purpose | Setup guardrail |
| --- | --- | --- |
| Amazon S3 | Private image evidence | Block public access; server-side encryption; least-privilege object prefixes; scoped short-lived presigned uploads; configure only the web/mobile CORS origins needed. |
| API Gateway HTTP API | HTTPS API entry point | Keep routes and payload limits small; images go direct to S3, not through the API. |
| AWS Lambda | API handlers and asynchronous processor | Separate API and worker roles; set timeouts/concurrency; log request/observation IDs and safe errors, never image bytes or secrets. |
| Amazon RDS for PostgreSQL with PostGIS | Deployed relational/spatial source of truth | Private subnets/security groups; enable only required extensions; restrict DB ingress to the chosen app path. Use Docker PostGIS locally. |
| AWS IAM | Service and developer access | Least privilege per API, worker, and deployer; no embedded long-lived keys. |
| Amazon CloudWatch | Logs/metrics/alarms | Set retention; monitor Lambda errors/throttles and processing failures. |
| AWS Secrets Manager | Server-side database/model secrets | Grant only the relevant runtime role access; rotate/delete after hackathon as appropriate. |

### Add only when useful/available

| Service | Use | Decision |
| --- | --- | --- |
| Amazon SQS + dead-letter queue | Buffer worker jobs, bound concurrency, and isolate repeated processing failures | Add if it can be wired and tested without delaying the end-to-end slice; otherwise use idempotent Lambda retries and explicit failure status. |
| Amazon Cognito | Managed officer identity | Stronger than a fake public auth layer, but configure only if the team can complete and test the login path. Never expose real operational data without auth. |
| Amazon Quick / Quick Sight | Executive metrics | Verify account access and analytics data connection early; not the transaction store. |
| NAT Gateway / VPC endpoints / RDS Proxy | Connectivity and DB scaling | Avoid unnecessary spend/setup for the prototype; add only where the selected network path requires it. |

The source spec names S3, Lambda/API Gateway, RDS PostgreSQL/PostGIS, CloudWatch, and Quick/Quick Sight. SQS and Cognito are conditional additions, not assumed requirements.

## 7. Street View decision and constraints

**Decision: do not use Street View for the hackathon MVP by default.** The [Street View Static API](https://developers.google.com/maps/documentation/streetview/overview) requires an API key and billing and charges per panorama request. Google states that prefetching, indexing, storing, or caching content is generally prohibited, with limited exceptions; attribution rules apply ([Street View policies](https://developers.google.com/maps/documentation/streetview/policies), [usage and billing](https://developers.google.com/maps/documentation/streetview/usage-and-billing)). It is extra setup and cost for a feature the demo does not need.

Use, in order of preference:

- A team member's own test photo of a public drain/road condition, captured without unnecessary people/plates and with team approval.
- Synthetic, visibly labeled seed evidence for a reliable demo.
- Images whose license explicitly permits the intended demo and model-processing use.

Do not claim synthetic or third-party imagery was captured by ASTIG. Keep the demo working without Google Maps credentials. Reconsider Street View only if there is a compelling product need, the team accepts billing, and the intended use is confirmed against Google's current terms.

## 8. AWS onboarding from an iPad

You can do the AWS work without installing tools on the iPad:

1. Keep the source code in the current GitHub Codespaces workspace.
2. Open AWS Console in the iPad browser using a named, team-approved developer role. Ask the account owner/admin to grant access; do not use or share the root account.
3. Open **AWS CloudShell** from the Console for browser-based AWS CLI commands. CloudShell uses the signed-in console identity, so do not create or paste long-lived access keys.
4. Before changing resources, verify account and region with `aws sts get-caller-identity` and `aws configure get region`. Confirm the expected account ID with the team owner.
5. Set an AWS Budget/billing alert and agree the resource cleanup date before deploying anything.
6. Use CloudShell for guided read-only checks and small setup operations. For project infrastructure code, edit in Codespaces, commit it, then deploy from the team-approved environment using the short-lived role. If Codespaces deployment credentials are not configured safely, do not copy static keys there—ask the account admin to enable an approved SSO/role path or deploy reviewed changes from CloudShell.
7. Start with the least costly resource that proves the path. Do not create RDS, NAT Gateway, Quick/Quick Sight, or a broad VPC layout before checking expected charges and agreeing on the database connectivity plan.

AWS Console labels can change; if a menu or command is unclear, stop and verify the account, region, and resource before proceeding. Do not paste account secrets or personal billing information into AI prompts.

### First CloudShell safety checks

Run these only after an account owner has granted access; they are read-only:

```bash
aws sts get-caller-identity
aws configure get region
```

Check that the returned account is the team's development account before any `create`, `deploy`, or `delete` command. If the identity or account is unexpected, stop and ask the account owner.

## 9. Environment and secret handling

Use an ignored `.env.local` per service or the team's supported secret manager. Commit only `.env.example` names and safe descriptions, never working values. Likely server-side settings to define after service setup:

```text
DATABASE_URL
AWS_REGION
S3_EVIDENCE_BUCKET
GEMINI_API_KEY
```

Use separate client-safe public config for map/API settings. Never place `DATABASE_URL`, AWS credentials, Gemini keys, or privileged S3 credentials in the web/mobile app. Validate required config at process startup and fail loudly when required values are absent.

## 10. Readiness gate: no feature build until all are true

- [ ] All four owners know their bounded deliverables and the integrator is named.
- [ ] Every developer can install/run the agreed local toolchain.
- [ ] Mobile owner has confirmed an Android install/test loop.
- [ ] Docker PostGIS plan works and migration/seed commands are assigned.
- [ ] Shared contracts and work-order transitions are agreed.
- [ ] The client owner has capacity/priority agreement for owning both mobile and web; support tasks are explicitly assigned to the other teammates.
- [ ] UI designer has a path to define tokens and revise layout without rewriting logic.
- [ ] AWS account, region, roles, budget alert, and service ownership are clear.
- [ ] Demo imagery is team-captured, synthetic, or explicitly licensed; no Street View dependency is required.
- [ ] Backend/AWS owner can use the approved browser-based AWS access path and verify account identity safely.
- [ ] A truthful happy-path demo and a failure fallback are written down.

After the gate, follow [role-specific starter prompts](role-prompts.md) and work in small vertical slices.
