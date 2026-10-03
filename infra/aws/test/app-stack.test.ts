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

  it("only allows PostgreSQL into the database from the VPC Lambda security group", () => {
    const ingress = resources("AWS::EC2::SecurityGroupIngress").filter((r) => r.Properties.FromPort === 5432);
    expect(ingress).toHaveLength(1);
    expect(ingress[0]!.Properties.SourceSecurityGroupId).toBeDefined();
    expect(ingress[0]!.Properties.CidrIp).toBeUndefined();
  });
});

describe("AppStack compute and access", () => {
  it("puts API/persist/admin in the VPC and keeps ingest outside it", () => {
    const fns = resources("AWS::Lambda::Function").filter((f) => f.Properties.Runtime === "nodejs22.x");
    expect(fns).toHaveLength(4);
    const inVpc = fns.filter((f) => f.Properties.VpcConfig);
    expect(inVpc).toHaveLength(3);
    const ingest = fns.find((f) => f.Properties.Environment?.Variables?.PERSIST_FUNCTION_NAME);
    expect(ingest?.Properties.VpcConfig).toBeUndefined();
    expect(ingest?.Properties.Environment.Variables.VISION_PROVIDER).toBe("none");
  });

  it("runs the API with JWT auth, never local-dev", () => {
    const api = resources("AWS::Lambda::Function").find((f) => f.Properties.Environment?.Variables?.ASTIG_AUTH_MODE);
    expect(api?.Properties.Environment.Variables).toMatchObject({ ASTIG_AUTH_MODE: "jwt", NODE_ENV: "production", NODE_EXTRA_CA_CERTS: "/var/runtime/ca-cert.pem" });
  });

  it("protects every API route with the Cognito JWT authorizer and throttles the stage", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", { AuthorizerType: "JWT" });
    const routes = resources("AWS::ApiGatewayV2::Route");
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) expect(r.Properties.AuthorizationType).toBe("JWT");
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
