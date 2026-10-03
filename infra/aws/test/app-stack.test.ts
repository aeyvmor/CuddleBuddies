import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { AppStack } from "../lib/app-stack";

// Synthesizes with real esbuild bundling of every Lambda (no AWS access).
let t: Template;
beforeAll(() => {
  const app = new App();
  const stack = new AppStack(app, "Test", {
    env: { account: "111111111111", region: "ap-southeast-1" },
    stage: "test",
    evidenceBucketName: "astig-test-evidence",
    evidenceBucketArn: "arn:aws:s3:::astig-test-evidence",
    apiCorsOrigins: ["http://localhost:5173"],
  });
  t = Template.fromStack(stack);
}, 240_000);

const resources = (type: string) => Object.values(t.findResources(type)) as { Properties: Record<string, any> }[];

describe("AppStack cost and network guardrails", () => {
  it("has no NAT gateway, internet gateway, or Elastic IP", () => {
    t.resourceCountIs("AWS::EC2::NatGateway", 0);
    t.resourceCountIs("AWS::EC2::InternetGateway", 0);
    t.resourceCountIs("AWS::EC2::EIP", 0);
  });

  it("runs one private, single-AZ db.t4g.micro PostgreSQL 17 with 20 GB gp3, encrypted", () => {
    t.resourceCountIs("AWS::RDS::DBInstance", 1);
    t.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      EngineVersion: "17.11",
      DBInstanceClass: "db.t4g.micro",
      AllocatedStorage: "20",
      StorageType: "gp3",
      MultiAZ: false,
      PubliclyAccessible: false,
      StorageEncrypted: true,
    });
  });

  it("has exactly one interface endpoint (Secrets Manager) in one subnet, plus the free S3 gateway endpoint", () => {
    const endpoints = resources("AWS::EC2::VPCEndpoint");
    const iface = endpoints.filter((e) => e.Properties.VpcEndpointType === "Interface");
    expect(iface).toHaveLength(1);
    expect(iface[0]!.Properties.SubnetIds).toHaveLength(1);
    expect(endpoints.filter((e) => e.Properties.VpcEndpointType === "Gateway")).toHaveLength(1);
  });

  it("only allows PostgreSQL into the database from Lambda security groups (never a CIDR)", () => {
    const ingress = resources("AWS::EC2::SecurityGroupIngress").filter((r) => r.Properties.FromPort === 5432);
    expect(ingress).toHaveLength(2); // VPC Lambdas + analytics export
    for (const rule of ingress) {
      expect(rule.Properties.SourceSecurityGroupId).toBeDefined();
      expect(rule.Properties.CidrIp).toBeUndefined();
    }
  });
});

describe("AppStack analytics export", () => {
  it("writes only to the analytics bucket prefix, on a 15-minute schedule", () => {
    const exportFn = Object.entries(t.findResources("AWS::Lambda::Function")).find(([, f]: any) => f.Properties.Environment?.Variables?.ANALYTICS_BUCKET);
    expect(exportFn).toBeDefined();
    expect((exportFn![1] as any).Properties.VpcConfig).toBeDefined();
    t.hasResourceProperties("AWS::Events::Rule", { ScheduleExpression: "rate(15 minutes)" });
    const policies = JSON.stringify(t.findResources("AWS::IAM::Policy"));
    expect(policies).toContain("/analytics/*");
  });

  it("keeps the analytics bucket private and TLS-only", () => {
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
    t.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } })]) },
    });
  });
});

describe("AppStack compute and access", () => {
  it("puts API/persist/admin/export in the VPC and keeps ingest outside it", () => {
    const fns = resources("AWS::Lambda::Function").filter((f) => f.Properties.Runtime === "nodejs22.x");
    expect(fns).toHaveLength(5);
    const inVpc = fns.filter((f) => f.Properties.VpcConfig);
    expect(inVpc).toHaveLength(4);
    const ingest = fns.find((f) => f.Properties.Environment?.Variables?.PERSIST_FUNCTION_NAME);
    expect(ingest?.Properties.VpcConfig).toBeUndefined();
    expect(ingest?.Properties.Environment.Variables).toMatchObject({ VISION_PROVIDER: "gemini", GEMINI_MODEL: "gemini-3.1-flash-lite" });
    expect(JSON.stringify(ingest?.Properties.Environment.Variables)).not.toMatch(/AIza/); // no key in env
  });

  it("runs the API with JWT auth, never local-dev", () => {
    const api = resources("AWS::Lambda::Function").find((f) => f.Properties.Environment?.Variables?.ASTIG_AUTH_MODE);
    expect(api?.Properties.Environment.Variables).toMatchObject({ ASTIG_AUTH_MODE: "jwt", NODE_ENV: "production", NODE_EXTRA_CA_CERTS: "/var/runtime/ca-cert.pem" });
  });

  it("protects every non-preflight API route with the Cognito JWT authorizer and throttles the stage", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", { AuthorizerType: "JWT" });
    const routes = resources("AWS::ApiGatewayV2::Route");
    const open = routes.filter((r) => r.Properties.AuthorizationType !== "JWT");
    // Only the CORS preflight route is unauthenticated, and it accepts OPTIONS only.
    expect(open.map((r) => r.Properties.RouteKey)).toEqual(["OPTIONS /{proxy+}"]);
    expect(routes.filter((r) => r.Properties.AuthorizationType === "JWT").map((r) => r.Properties.RouteKey)).toEqual(["$default"]);
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", { DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 } });
  });

  it("disables Cognito self sign-up and creates OFFICER/OPERATOR groups", () => {
    t.hasResourceProperties("AWS::Cognito::UserPool", { AdminCreateUserConfig: { AllowAdminCreateUserOnly: true } });
    t.hasResourceProperties("AWS::Cognito::UserPoolGroup", { GroupName: "OFFICER" });
    t.hasResourceProperties("AWS::Cognito::UserPoolGroup", { GroupName: "OPERATOR" });
  });

  it("triggers ingest only for observation images", () => {
    t.hasResourceProperties("Custom::S3BucketNotifications", {
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          Match.objectLike({
            Events: ["s3:ObjectCreated:*"],
            Filter: { Key: { FilterRules: Match.arrayWith([{ Name: "suffix", Value: ".jpg" }, { Name: "prefix", Value: "sessions/" }]) } },
          }),
        ],
      },
    });
  });

  it("sets one-week log retention on every function log group", () => {
    for (const g of resources("AWS::Logs::LogGroup")) expect(g.Properties.RetentionInDays).toBe(7);
  });
});
