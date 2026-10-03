-- 0005_detection_regions.sql
-- Optional AI-estimated problem regions per detection: JSON array of
-- { "label": <issue type>, "box": [ymin, xmin, ymax, xmax] } with 0-1000 coordinates.
-- Validated by the shared Detection schema before insert; the database bounds the shape.
ALTER TABLE detections ADD COLUMN regions jsonb
  CHECK (regions IS NULL OR (jsonb_typeof(regions) = 'array' AND jsonb_array_length(regions) <= 5));
