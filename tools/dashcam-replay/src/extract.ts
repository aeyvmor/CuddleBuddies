import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { frameFileName, type ReplayPlan } from "./plan";

export type Runner = (cmd: string, args: string[]) => Promise<void>;

const execFileP = promisify(execFile);
/** Runs a binary with an argument array (no shell), so file names cannot inject commands. */
export const defaultRunner: Runner = async (cmd, args) => {
  await execFileP(cmd, args, { windowsHide: true, maxBuffer: 1024 * 1024 });
};

/** ffmpeg arguments for one still: accurate seek, metadata stripped, width capped at 1920. */
export function ffmpegArgs(video: string, videoSec: number, out: string): string[] {
  return [
    "-hide_banner", "-loglevel", "error",
    "-ss", videoSec.toFixed(3),
    "-i", video,
    "-frames:v", "1",
    "-map_metadata", "-1",
    "-vf", "scale='min(1920,iw)':-2",
    "-q:v", "3",
    "-y", out,
  ];
}

/**
 * Extracts one JPEG per planned frame into `<workDir>/frames/`. These are UNREDACTED and stay
 * local: replay only ever uploads from `<workDir>/redacted/`.
 */
export async function extractFrames(
  plan: ReplayPlan,
  workDir: string,
  opts: { runner?: Runner; ffmpeg?: string; log?: (m: string) => void } = {},
): Promise<number> {
  const runner = opts.runner ?? defaultRunner;
  const ffmpeg = opts.ffmpeg ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  const outDir = path.join(workDir, "frames");
  await mkdir(outDir, { recursive: true });
  let n = 0;
  for (const f of plan.frames) {
    await runner(ffmpeg, ffmpegArgs(plan.videoFile, f.videoSec, path.join(outDir, frameFileName(f.index))));
    n++;
    if (n % 25 === 0) opts.log?.(`extracted ${n}/${plan.frames.length}`);
  }
  return n;
}
