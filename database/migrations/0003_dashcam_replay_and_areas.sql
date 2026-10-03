-- 0003_dashcam_replay_and_areas.sql
-- 1. DASHCAM_REPLAY sampling method: frames replayed from recorded dashcam footage are never
--    presented as on-device GPS/VIO sampling.
-- 2. Administrative areas (attributed boundary data) used to tag issues with an area name.

ALTER TABLE observations DROP CONSTRAINT observations_sampling_method_check;
ALTER TABLE observations ADD CONSTRAINT observations_sampling_method_check
  CHECK (sampling_method IN ('VIO_DISTANCE', 'GPS_DISTANCE', 'MANUAL', 'DASHCAM_REPLAY'));

CREATE TABLE admin_areas (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,80}$'),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  level       text NOT NULL CHECK (level IN ('CITY', 'BARANGAY')),
  -- Data source and licence, e.g. 'OpenStreetMap contributors (ODbL)'. Required: no unattributed boundaries.
  source      text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 300),
  geom        geometry(MultiPolygon, 4326) NOT NULL CHECK (ST_IsValid(geom)),
  loaded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_areas_geom_gix ON admin_areas USING gist (geom);

-- Most specific matching area name for a point, or NULL (unknown, never guessed).
CREATE FUNCTION astig_area_name_for(lat double precision, lon double precision) RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT a.name FROM admin_areas a
   WHERE ST_Intersects(a.geom, ST_SetSRID(ST_MakePoint(lon, lat), 4326))
   ORDER BY CASE a.level WHEN 'BARANGAY' THEN 0 ELSE 1 END, ST_Area(a.geom)
   LIMIT 1
$$;
