import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, Tags, type StackProps } from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi, HttpMethod, HttpNoneAuthorizer, type CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fromRoot = (...p: string[]) => path.join(REPO_ROOT, ...p);

export interface AppStackProps extends StackProps {
  stage: string;
  evidenceBucketName: string;
  evidenceBucketArn: string;
  /** Browser origins allowed to call the API (web dashboard). */
  apiCorsOrigins: string[];
}

/**
 * ASTIG application stack. Cost-driven shape (see infra/aws/README.md):
 * - No NAT gateway and no public database: RDS sits in isolated subnets.
 * - VPC Lambdas (API, persist, admin) reach RDS directly and Secrets Manager through one
 *   interface endpoint; presigning S3 URLs needs no network.
 * - The ingest Lambda runs outside the VPC so it can reach the vision provider, and hands
 *   validated results to the VPC persist Lambda.
 */
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // ---------------- Network ----------------
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2, // RDS subnet groups need two AZs
      natGateways: 0,
      subnetConfiguration: [{ name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } }, // free
    });

    const lambdaSg = new ec2.SecurityGroup(this, "VpcLambdaSg", { vpc, allowAllOutbound: false, description: "ASTIG VPC Lambdas" });
    const dbSg = new ec2.SecurityGroup(this, "DatabaseSg", { vpc, allowAllOutbound: false, description: "ASTIG PostgreSQL" });
    const endpointSg = new ec2.SecurityGroup(this, "EndpointSg", { vpc, allowAllOutbound: false, description: "Secrets Manager endpoint" });
    dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), "PostgreSQL from VPC Lambdas only");
    lambdaSg.addEgressRule(dbSg, ec2.Port.tcp(5432), "to PostgreSQL");
    endpointSg.addIngressRule(lambdaSg, ec2.Port.tcp(443), "HTTPS from VPC Lambdas");
    lambdaSg.addEgressRule(endpointSg, ec2.Port.tcp(443), "to Secrets Manager endpoint");

    // One AZ only to halve the hourly endpoint cost; Lambdas in either AZ resolve it via private DNS.
    vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnets: [vpc.isolatedSubnets[0]!] },
      securityGroups: [endpointSg],
      privateDnsEnabled: true,
    });

    // ---------------- Database ----------------
    const db = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.of("17.11", "17") }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      publiclyAccessible: false,
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      credentials: rds.Credentials.fromGeneratedSecret("astig_admin"),
      databaseName: "astig",
      backupRetention: Duration.days(1),
      deleteAutomatedBackups: true,
      enablePerformanceInsights: false,
      autoMinorVersionUpgrade: true,
      // Synthetic demo data, reproducible from migrations + seed: no final snapshot on teardown.
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
    });
    const dbSecret = db.secret!;

    // Placeholder for the worker owner's provider key; replace the value in the console, never in code.
    const visionSecret = new secretsmanager.Secret(this, "VisionProviderApiKey", {
      description: "ASTIG vision provider API key (set by the worker owner; placeholder until then)",
      secretStringValue: SecretValue.unsafePlainText("NOT_CONFIGURED"),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---------------- Auth (Cognito) ----------------
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false, // officers/operators are created by the account owner
      signInAliases: { username: true, email: true },
      featurePlan: cognito.FeaturePlan.LITE,
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new cognito.CfnUserPoolGroup(this, "OfficerGroup", { userPoolId: userPool.userPoolId, groupName: "OFFICER", description: "Reviews issues and manages work orders" });
    new cognito.CfnUserPoolGroup(this, "OperatorGroup", { userPoolId: userPool.userPoolId, groupName: "OPERATOR", description: "Runs inspection sessions and uploads captures" });
    const userPoolClient = userPool.addClient("AppClient", {
      generateSecret: false, // public clients (web/mobile)
      authFlows: { userSrp: true, userPassword: true },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
      preventUserExistenceErrors: true,
    });

    // ---------------- Lambdas ----------------
    const fn = (id: string, entry: string, extra: Partial<NodejsFunctionProps> = {}) =>
      new NodejsFunction(this, id, {
        entry: fromRoot(entry),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(15),
        projectRoot: REPO_ROOT,
        depsLockFilePath: fromRoot("package-lock.json"),
        logGroup: new logs.LogGroup(this, `${id}Logs`, { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
        bundling: {
          format: OutputFormat.CJS,
          target: "node22",
          minify: true,
          sourceMap: true,
          externalModules: ["@aws-sdk/*", "pg-native"], // AWS SDK v3 ships with the runtime
          ...extra.bundling,
        },
        ...extra,
        environment: { NODE_OPTIONS: "--enable-source-maps", ...extra.environment },
      });

    const vpcFn = (id: string, entry: string, extra: Partial<NodejsFunctionProps> = {}) => {
      const f = fn(id, entry, {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [lambdaSg],
        ...extra,
        environment: {
          DB_SECRET_ARN: dbSecret.secretArn,
          // RDS CA bundle shipped in the Lambda runtime; required for verified TLS to RDS.
          NODE_EXTRA_CA_CERTS: "/var/runtime/ca-cert.pem",
          ...extra.environment,
        },
      });
      dbSecret.grantRead(f);
      return f;
    };

    const bucket = s3.Bucket.fromBucketAttributes(this, "EvidenceBucket", {
      bucketName: props.evidenceBucketName,
      bucketArn: props.evidenceBucketArn,
    });

    const apiFn = vpcFn("ApiFunction", "services/api/src/lambda.ts", {
      handler: "lambdaHandler",
      timeout: Duration.seconds(10),
      environment: { ASTIG_AUTH_MODE: "jwt", NODE_ENV: "production", S3_EVIDENCE_BUCKET: props.evidenceBucketName },
    });
    // Presigned URLs act with the signer's permissions: PUT/GET on observation keys only.
    bucket.grantPut(apiFn, "sessions/*");
    bucket.grantRead(apiFn, "sessions/*");

    const persistFn = vpcFn("PersistFunction", "services/worker/src/lambda-persist.ts", { timeout: Duration.seconds(20) });

    const adminFn = vpcFn("AdminFunction", "database/lambda/admin.ts", {
      timeout: Duration.seconds(120),
      environment: { ASTIG_MIGRATIONS_DIR: "/var/task/migrations" },
      bundling: {
        format: OutputFormat.CJS,
        target: "node22",
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/*", "pg-native"],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDir: string, outputDir: string) => {
            const src = fromRoot("database", "migrations").replace(/\\/g, "/");
            const dst = path.join(outputDir, "migrations").replace(/\\/g, "/");
            return [`node -e "require('fs').cpSync('${src}','${dst}',{recursive:true})"`];
          },
        },
      },
    });

    const ingestFn = fn("IngestFunction", "services/worker/src/lambda-ingest.ts", {
      timeout: Duration.seconds(60),
      environment: {
        PERSIST_FUNCTION_NAME: persistFn.functionName,
        VISION_PROVIDER: "none",
        VISION_SECRET_ARN: visionSecret.secretArn,
      },
    });
    persistFn.grantInvoke(ingestFn);
    bucket.grantRead(ingestFn, "sessions/*");
    visionSecret.grantRead(ingestFn);
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(ingestFn), {
      prefix: "sessions/",
      suffix: ".jpg",
    });

    // ---------------- HTTP API ----------------
    const authorizer = new HttpJwtAuthorizer("CognitoAuthorizer", `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });
    const httpApi = new HttpApi(this, "HttpApi", {
      description: "ASTIG API",
      defaultIntegration: new HttpLambdaIntegration("ApiIntegration", apiFn),
      defaultAuthorizer: authorizer,
      corsPreflight: {
        allowOrigins: props.apiCorsOrigins,
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PATCH, CorsHttpMethod.OPTIONS],
        maxAge: Duration.minutes(10),
      },
    });
    const stage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 20, throttlingBurstLimit: 40 };
    // The JWT-protected $default route also catches OPTIONS, and browsers send CORS preflights
    // without a token. This unauthenticated route only answers preflights (the Lambda returns 204
    // for OPTIONS without touching data); every other method still requires a valid JWT.
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [HttpMethod.OPTIONS],
      integration: new HttpLambdaIntegration("PreflightIntegration", apiFn),
      authorizer: new HttpNoneAuthorizer(),
    });

    Tags.of(this).add("project", "astig");
    Tags.of(this).add("stage", props.stage);

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, "AdminFunctionName", { value: adminFn.functionName });
    new CfnOutput(this, "IngestFunctionName", { value: ingestFn.functionName });
    new CfnOutput(this, "PersistFunctionName", { value: persistFn.functionName });
    new CfnOutput(this, "VisionSecretName", { value: visionSecret.secretName });
  }
}
