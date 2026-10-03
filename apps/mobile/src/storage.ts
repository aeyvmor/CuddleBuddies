/**
 * Device storage for the session and capture queue (expo-file-system). Everything
 * stays in the app's private document directory: never the gallery, never uploaded.
 * Format and validation live in src/persist.ts.
 */
import { Directory, File, Paths } from "expo-file-system";
import { parse, serialize, type PersistedState } from "./persist";

const STATE_FILE = "astig-state.json";
const STATE_TMP = "astig-state.json.tmp";
const CAPTURE_DIR = "captures";

export type LoadResult =
  | { status: "NONE" }
  | { status: "OK"; state: PersistedState }
  | { status: "UNREADABLE"; error: string; savedAside: string | null };

/** Read the saved state. A damaged file is moved aside (kept for the team) and reported, never silently discarded. */
export function loadState(): LoadResult {
  const file = new File(Paths.document, STATE_FILE);
  if (!file.exists) return { status: "NONE" };
  let text: string;
  try {
    text = file.textSync();
  } catch (e) {
    return { status: "UNREADABLE", error: `read failed: ${e instanceof Error ? e.message : String(e)}`, savedAside: null };
  }
  const r = parse(text);
  if (r.ok) return { status: "OK", state: r.state };
  const aside = new File(Paths.document, `astig-state.unreadable-${Date.now()}.json`);
  try {
    file.moveSync(aside);
    return { status: "UNREADABLE", error: r.error, savedAside: aside.uri };
  } catch {
    return { status: "UNREADABLE", error: r.error, savedAside: null };
  }
}

/** Write to a temporary file, then replace, so a crash mid-write cannot leave a half-written state file. */
export function saveState(state: PersistedState): void {
  const tmp = new File(Paths.document, STATE_TMP);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(serialize(state));
  tmp.moveSync(new File(Paths.document, STATE_FILE), { overwrite: true });
}

/**
 * Move a just-taken image out of the cache (which Android may clear) into the app's
 * private capture folder, named by its clientObservationId. Returns the new URI.
 */
export function keepImage(uri: string, clientObservationId: string): string {
  const dir = new Directory(Paths.document, CAPTURE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, `${clientObservationId}.jpg`);
  const src = new File(uri);
  src.moveSync(target, { overwrite: true });
  return target.uri;
}
