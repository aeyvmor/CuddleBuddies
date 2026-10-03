import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { extractFrames } from "./extract";
import { sha256File } from "./ids";
import { buildPlan, RouteFile, type ReplayPlan } from "./plan";
import { cognitoLogin, replay } from "./replay";

const USAGE = `ASTIG dashcam replay (demo data; see docs/operations/dashcam-demo-data.md)

  plan     --route <route.json> [--interval 7] [--work <dir>]
           Distance-sample the traced route; writes <work>/plan.json.
  extract  [--work <dir>]
           ffmpeg one frame per planned point into <work>/frames/ (UNREDACTED, local only).
  replay   [--work <dir>] [--keep-open]
           Upload curated frames from <work>/redacted/ through the real API.
           Env: ASTIG_API_URL, ASTIG_COGNITO_CLIENT_ID, ASTIG_COGNITO_REGION (default ap-southeast-1),
                ASTIG_OPERATOR_USERNAME, ASTIG_OPERATOR_PASSWORD, ASTIG_REPLAY_DEVICE_ID, ASTIG_REPLAY_VEHICLE_ID

Default --work: tools/dashcam-replay/work/<route name>  (git-ignored)`;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (put it in the git-ignored .env)`);
  return v;
}

async function loadPlan(workDir: string): Promise<ReplayPlan> {
  return JSON.parse(await readFile(path.join(workDir, "plan.json"), "utf8")) as ReplayPlan;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: { route: { type: "string" }, interval: { type: "string", default: "7" }, work: { type: "string" }, "keep-open": { type: "boolean", default: false } },
  });
  const toolRoot = path.resolve(import.meta.dirname, "..");
  const log = (m: string) => console.log(m);

  if (command === "plan") {
    if (!values.route) throw new Error("--route is required");
    const routePath = path.resolve(values.route);
    const route = RouteFile.parse(JSON.parse(await readFile(routePath, "utf8")));
    const videoFile = path.resolve(path.dirname(routePath), route.video);
    const workDir = path.resolve(values.work ?? path.join(toolRoot, "work", route.name));
    log(`hashing ${path.basename(videoFile)} ...`);
    const plan = buildPlan(route, { videoFile, videoSha256: await sha256File(videoFile), intervalM: Number(values.interval) });
    await mkdir(workDir, { recursive: true });
    await writeFile(path.join(workDir, "plan.json"), JSON.stringify(plan, null, 2));
    const length = plan.frames.length ? plan.frames[plan.frames.length - 1]!.distanceAlongRouteM - plan.frames[0]!.distanceAlongRouteM : 0;
    log(`planned ${plan.frames.length} frames every ${plan.intervalM} m over ${length.toFixed(0)} m → ${path.join(workDir, "plan.json")}`);
    for (const w of plan.warnings) log(`WARNING: ${w}`);
    return;
  }

  const workDir = path.resolve(values.work ?? (() => { throw new Error("--work is required (the folder printed by `plan`)"); })());
  const plan = await loadPlan(workDir);

  if (command === "extract") {
    const n = await extractFrames(plan, workDir, { log });
    await mkdir(path.join(workDir, "redacted"), { recursive: true });
    log(`extracted ${n} frames to ${path.join(workDir, "frames")}`);
    log(`NEXT: blur faces and plates, delete unusable frames, and save the results with the SAME file names in ${path.join(workDir, "redacted")}. A second person checks every frame.`);
    return;
  }

  if (command === "replay") {
    const token = await cognitoLogin({
      region: process.env.ASTIG_COGNITO_REGION ?? "ap-southeast-1",
      clientId: need("ASTIG_COGNITO_CLIENT_ID"),
      username: need("ASTIG_OPERATOR_USERNAME"),
      password: need("ASTIG_OPERATOR_PASSWORD"),
    });
    const summary = await replay(plan, {
      apiUrl: need("ASTIG_API_URL"),
      token,
      deviceId: need("ASTIG_REPLAY_DEVICE_ID"),
      vehicleId: need("ASTIG_REPLAY_VEHICLE_ID"),
      redactedDir: path.join(workDir, "redacted"),
      keepSessionOpen: values["keep-open"],
      log,
    });
    log(JSON.stringify(summary, null, 2));
    if (summary.uploaded + summary.alreadyUploaded === 0) log("WARNING: nothing uploaded. Is the redacted/ folder empty?");
    return;
  }

  console.log(USAGE);
  process.exitCode = command ? 1 : 0;
}

main().catch((err) => {
  console.error(`error: ${(err as Error).message}`);
  process.exitCode = 1;
});
