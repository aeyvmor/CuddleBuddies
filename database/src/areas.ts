import type { Queryable } from "./support";

export interface AreaInput {
  id: string;
  name: string;
  level: "CITY" | "BARANGAY";
  geometry: unknown;
}

const AREA_ID = /^[a-z0-9-]{1,80}$/;

/**
 * Upserts attributed boundaries, then tags issues that have no area yet. Never overwrites a
 * non-null area_name. Must run inside the caller's transaction.
 */
export async function loadAreas(db: Queryable, source: string, areas: AreaInput[]): Promise<{ loaded: number; issuesTagged: number }> {
  if (!source || source.length > 300) throw new Error("source (data attribution) is required");
  if (!Array.isArray(areas) || areas.length === 0 || areas.length > 100) throw new Error("areas must have 1-100 entries");
  for (const a of areas) {
    if (!AREA_ID.test(a.id) || !a.name || a.name.length > 200 || (a.level !== "CITY" && a.level !== "BARANGAY")) {
      throw new Error(`invalid area ${String(a.id)}`);
    }
    await db.query(
      `INSERT INTO admin_areas (id, name, level, source, geom)
       VALUES ($1, $2, $3, $4, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)), 3)))
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level, source = EXCLUDED.source,
         geom = EXCLUDED.geom, loaded_at = now()`,
      [a.id, a.name, a.level, source, JSON.stringify(a.geometry)],
    );
  }
  const tagged = await db.query(
    `UPDATE issues SET area_name = astig_area_name_for(latitude, longitude), updated_at = now()
      WHERE area_name IS NULL AND astig_area_name_for(latitude, longitude) IS NOT NULL`,
  );
  return { loaded: areas.length, issuesTagged: tagged.rowCount ?? 0 };
}
