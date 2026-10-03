# AWS infrastructure (CDK, TypeScript)

This is reviewable infrastructure code for the hackathon deployment. **Nothing in this folder has been deployed.** Synthesizing produces a CloudFormation template locally and does not contact AWS.

## What the code defines today

`lib/evidence-stack.ts` defines one stack, `Astig-<stage>-Evidence`, containing a single private S3 bucket for image evidence:

- All public access blocked, ACLs disabled (bucket-owner-enforced), SSE-S3 encryption, and HTTPS-only access through a bucket policy that denies non-TLS requests.
- Objects expire after `evidenceRetentionDays` (default 30; the team still has to decide retention). Incomplete uploads are cleaned up after 1 day.
- `RemovalPolicy.RETAIN`: deleting the stack does not delete evidence. Cleanup is a deliberate, separate step.
- CORS is off by default. If origins are configured, it allows `PUT` only, for presigned uploads.

It deliberately leaves out RDS, VPC/NAT, Lambda, API Gateway, and Cognito until the database connectivity plan, auth choice, and cost are agreed. Expected cost of this stack alone at demo scale is S3 storage and requests, a few cents. Check the [AWS Pricing Calculator](https://calculator.aws/) for your region before deploying.

## Local checks (no AWS access needed)

```text
npm test                                                           # includes CDK assertion tests
cd infra/aws
npx cdk synth -c account=111111111111 -c region=ap-southeast-1     # placeholder account; prints the template
```

The app refuses to synthesize unless you pass `account` and `region` explicitly, so it can never target whatever credentials happen to be active.

## Learning path: what to do in AWS, in order

Do steps 1–3 before any deploy. Steps 1–2 are read-only.

1. **Sign in with your own named identity, not root.** Ask the account owner for IAM Identity Center (SSO) access, or an individually assigned role with MFA. Don't create or paste long-lived access keys. *Why:* root and shared keys can't be scoped or audited, and leaked keys are a common way accounts get compromised.

2. **Open CloudShell and confirm where you are.** In the Console, click the CloudShell icon (`>_`) in the top bar. CloudShell is a browser terminal that already uses your signed-in identity. Then run:

   ```bash
   aws sts get-caller-identity     # who am I? shows the Account ID and the role/user ARN
   aws configure get region        # which region will commands go to? (may be blank)
   echo $AWS_REGION                # CloudShell's region, matching the Console's region selector
   ```

   Compare the Account ID with the team's development account. If it is unexpected, stop and ask the account owner. *Why:* every create or deploy command acts on this account and region.

3. **Ask the account owner to confirm budget and permissions.** They should set an AWS Budget with an email alert (Billing → Budgets), confirm your role may deploy CloudFormation/CDK stacks in the agreed region, and record a cleanup date. *Why:* billing alerts catch forgotten resources, and least privilege limits mistakes.

4. **Review the template together.** Run `npx cdk synth` with the real account ID and region, then read the YAML. It should contain exactly one bucket and one bucket policy. When credentials are available, `npx cdk diff` shows what would change before anything happens.

5. **Bootstrap once, but only after approval.** `npx cdk bootstrap aws://<account>/<region>` creates the `CDKToolkit` stack: a staging S3 bucket, an ECR repository, and IAM roles. It is low-cost but it does create resources. Needs explicit approval of account, region, and cost.

6. **Deploy, but only after approval.** `npx cdk deploy -c account=<id> -c region=<region>`. CDK shows IAM and security changes and asks before applying them. Afterwards, check the bucket in the S3 console under Permissions: "Block all public access" should be on.

7. **Clean up after the event.** Empty the bucket, delete it (it is retained by design), then delete the stack. Remove the CDKToolkit stack too if nothing else uses it.

Running CDK requires Node 24 and either `npx` (the CLI is pinned in `package.json`) or deploy credentials from CloudShell. Don't copy static keys into Codespaces.

## Next infrastructure, pending team decisions

API Gateway HTTP API + Lambda (`services/api/src/lambda.ts`), a JWT authorizer, the worker Lambda triggered by S3 events (or SQS with a DLQ), RDS PostgreSQL with PostGIS, and the network path to reach it (Lambda in a VPC without NAT, or RDS Proxy, needs a decision), Secrets Manager, and CloudWatch alarms. Coordinate the upload-URL and worker interfaces with the integration owner before adding them.
