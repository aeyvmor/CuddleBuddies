-- 0001_initial_schema.sql
-- ASTIG v0 core schema (draft contract: docs/api/contract-v0-proposal.md).
-- Conventions: UTC timestamptz; WGS84 numeric lat/lon with range checks plus a generated
-- geometry(Point,4326); image bytes live in private S3 (only object keys stored here);
-- constrained status values; every demo row carries is_synthetic.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Devices, vehicles, inspection sessions
-- ---------------------------------------------------------------------------
CREATE TABLE devices (
  id           uuid PRIMARY KEY,
  label        text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  is_synthetic boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id           uuid PRIMARY KEY,
  label        text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  is_synthetic boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inspection_sessions (
  id               uuid PRIMARY KEY,
  device_id        uuid NOT NULL REFERENCES devices (id),
  vehicle_id       uuid NOT NULL REFERENCES vehicles (id),
  operator_subject text NOT NULL CHECK (char_length(operator_subject) BETWEEN 1 AND 200),
  status           text NOT NULL CHECK (status IN ('ACTIVE', 'ENDED')),
  started_at       timestamptz NOT NULL,
  ended_at         timestamptz,
  -- BETWEEN rejects NaN/Infinity as well as out-of-range values.
  start_latitude   double precision NOT NULL CHECK (start_latitude BETWEEN -90 AND 90),
  start_longitude  double precision NOT NULL CHECK (start_longitude BETWEEN -180 AND 180),
  start_geom       geometry(Point, 4326) GENERATED ALWAYS AS
                     (ST_SetSRID(ST_MakePoint(start_longitude, start_latitude), 4326)) STORED,
  is_synthetic     boolean NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_sessions_end_consistent CHECK (
    (status = 'ACTIVE' AND ended_at IS NULL)
    OR (status = 'ENDED' AND ended_at IS NOT NULL AND ended_at >= started_at)
  )
);
CREATE INDEX inspection_sessions_device_started_idx ON inspection_sessions (device_id, started_at DESC);
CREATE INDEX inspection_sessions_vehicle_started_idx ON inspection_sessions (vehicle_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Issues (canonical operational grouping of observations)
-- ---------------------------------------------------------------------------
CREATE TABLE issues (
  id                     uuid PRIMARY KEY,
  issue_type             text NOT NULL CHECK (issue_type IN
                           ('BLOCKED_DRAIN', 'DAMAGED_DRAIN', 'STANDING_WATER', 'ROAD_DAMAGE', 'OTHER')),
  status                 text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  latitude               double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude              double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  geom                   geometry(Point, 4326) GENERATED ALWAYS AS
                           (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  -- Approximate radius of uncertainty; NULL = unknown. Raw GPS is not an exact asset location.
  location_uncertainty_m double precision CHECK (location_uncertainty_m >= 0 AND location_uncertainty_m <= 100000),
  area_name              text CHECK (char_length(area_name) BETWEEN 1 AND 200),
  road_name              text CHECK (char_length(road_name) BETWEEN 1 AND 200),
  first_observed_at      timestamptz NOT NULL,
  last_observed_at       timestamptz NOT NULL,
  is_synthetic           boolean NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issues_observed_order CHECK (last_observed_at >= first_observed_at)
);
CREATE INDEX issues_geom_gix ON issues USING gist (geom);
-- Metre-based radius queries: ST_DWithin(geom::geography, ..., metres).
CREATE INDEX issues_geog_gix ON issues USING gist ((geom::geography));
CREATE INDEX issues_status_type_idx ON issues (status, issue_type);

-- ---------------------------------------------------------------------------
-- Observations (immutable capture metadata + S3 object reference + processing state)
-- ---------------------------------------------------------------------------
CREATE TABLE observations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES inspection_sessions (id),
  -- Client-generated idempotency key, unique per session.
  client_observation_id    uuid NOT NULL,
  -- sha256 hex of the canonical capture metadata; detects key reuse with different content.
  idempotency_fingerprint  text NOT NULL CHECK (idempotency_fingerprint ~ '^[0-9a-f]{64}$'),
  schema_version           text NOT NULL CHECK (char_length(schema_version) BETWEEN 1 AND 32),
  sequence_number          integer NOT NULL CHECK (sequence_number >= 0),
  captured_at              timestamptz NOT NULL,
  latitude                 double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude                double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  geom                     geometry(Point, 4326) GENERATED ALWAYS AS
                             (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  horizontal_accuracy_m    double precision CHECK (horizontal_accuracy_m >= 0 AND horizontal_accuracy_m <= 100000),
  sampling_method          text NOT NULL CHECK (sampling_method IN ('VIO_DISTANCE', 'GPS_DISTANCE', 'MANUAL')),
  distance_from_previous_m double precision CHECK (distance_from_previous_m >= 0 AND distance_from_previous_m <= 100000),
  -- Server-derived private S3 key, never client-supplied. No image bytes in the database.
  image_object_key         text NOT NULL UNIQUE CHECK (char_length(image_object_key) BETWEEN 1 AND 1024),
  image_uploaded_at        timestamptz,
  processing_status        text NOT NULL DEFAULT 'PENDING'
                             CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  processing_attempts      integer NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  processing_error_code    text CHECK (char_length(processing_error_code) BETWEEN 1 AND 64),
  processing_error_message text CHECK (char_length(processing_error_message) BETWEEN 1 AND 500),
  issue_id                 uuid REFERENCES issues (id),
  is_synthetic             boolean NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT observations_client_id_unique UNIQUE (session_id, client_observation_id),
  -- FAILED must carry an error; other states must not carry a stale one.
  CONSTRAINT observations_processing_error_consistent CHECK (
    (processing_status = 'FAILED' AND processing_error_code IS NOT NULL AND processing_error_message IS NOT NULL)
    OR (processing_status <> 'FAILED' AND processing_error_code IS NULL AND processing_error_message IS NULL)
  )
);
CREATE INDEX observations_geom_gix ON observations USING gist (geom);
CREATE INDEX observations_issue_captured_idx ON observations (issue_id, captured_at DESC) WHERE issue_id IS NOT NULL;
CREATE INDEX observations_session_sequence_idx ON observations (session_id, sequence_number);
CREATE INDEX observations_open_processing_idx ON observations (processing_status, created_at)
  WHERE processing_status IN ('PENDING', 'PROCESSING', 'FAILED');

-- ---------------------------------------------------------------------------
-- Detections (validated, provider-neutral model output; one per observation)
-- ---------------------------------------------------------------------------
CREATE TABLE detections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id        uuid NOT NULL UNIQUE REFERENCES observations (id),
  schema_version        text NOT NULL CHECK (char_length(schema_version) BETWEEN 1 AND 32),
  infrastructure_visible boolean NOT NULL,
  issue_type            text NOT NULL CHECK (issue_type IN
                          ('BLOCKED_DRAIN', 'DAMAGED_DRAIN', 'STANDING_WATER', 'ROAD_DAMAGE', 'OTHER', 'NONE')),
  obstruction_type      text NOT NULL CHECK (obstruction_type IN
                          ('GARBAGE', 'SEDIMENT', 'VEGETATION', 'DEBRIS', 'OTHER', 'NONE')),
  blockage_percent      double precision CHECK (blockage_percent BETWEEN 0 AND 100),
  severity_estimate     text NOT NULL CHECK (severity_estimate IN ('NONE', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
  confidence            double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_description  text NOT NULL CHECK (char_length(evidence_description) BETWEEN 1 AND 500),
  requires_human_review boolean NOT NULL,
  model_version         text NOT NULL CHECK (char_length(model_version) BETWEEN 1 AND 100),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detections_not_visible_consistent CHECK (
    infrastructure_visible OR (issue_type = 'NONE' AND blockage_percent IS NULL)
  )
);

-- An observation may only be COMPLETED if a validated detection exists (checked at commit,
-- so the worker can insert the detection and set the status in one transaction).
CREATE FUNCTION astig_check_completed_has_detection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.processing_status = 'COMPLETED'
     AND NOT EXISTS (SELECT 1 FROM detections d WHERE d.observation_id = NEW.id) THEN
    RAISE EXCEPTION 'observation % is COMPLETED without a detection', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER observations_completed_has_detection
  AFTER INSERT OR UPDATE OF processing_status ON observations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION astig_check_completed_has_detection();

-- ---------------------------------------------------------------------------
-- Risk assessments (versioned, explainable score breakdown)
-- ---------------------------------------------------------------------------
CREATE TABLE risk_assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id        uuid NOT NULL REFERENCES issues (id),
  formula_version text NOT NULL CHECK (char_length(formula_version) BETWEEN 1 AND 32),
  total_score     numeric(5, 2) NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  known_cap_total numeric(5, 2) NOT NULL CHECK (known_cap_total BETWEEN 0 AND 100),
  computed_at     timestamptz NOT NULL DEFAULT now(),
  -- Allows work orders to reference (assessment, issue) together.
  CONSTRAINT risk_assessments_id_issue_unique UNIQUE (id, issue_id)
);
CREATE INDEX risk_assessments_issue_computed_idx ON risk_assessments (issue_id, computed_at DESC);

CREATE TABLE risk_score_components (
  risk_assessment_id uuid NOT NULL REFERENCES risk_assessments (id) ON DELETE CASCADE,
  factor             text NOT NULL CHECK (factor IN ('SEVERITY', 'WEATHER', 'RECURRENCE', 'HAZARD', 'EXPOSURE')),
  weight             numeric(4, 3) NOT NULL CHECK (weight BETWEEN 0 AND 1),
  cap                numeric(5, 2) NOT NULL CHECK (cap BETWEEN 0 AND 100),
  input_status       text NOT NULL CHECK (input_status IN ('KNOWN', 'UNKNOWN')),
  normalized_value   double precision CHECK (normalized_value BETWEEN 0 AND 100),
  weighted_points    numeric(5, 2) CHECK (weighted_points >= 0),
  source             text CHECK (char_length(source) BETWEEN 1 AND 200),
  rationale          text NOT NULL CHECK (char_length(rationale) BETWEEN 1 AND 500),
  PRIMARY KEY (risk_assessment_id, factor),
  CONSTRAINT risk_score_components_points_capped CHECK (weighted_points <= cap),
  -- UNKNOWN is not zero risk: it carries no value at all.
  CONSTRAINT risk_score_components_known_consistent CHECK (
    (input_status = 'KNOWN' AND normalized_value IS NOT NULL AND weighted_points IS NOT NULL)
    OR (input_status = 'UNKNOWN' AND normalized_value IS NULL AND weighted_points IS NULL)
  )
);

-- At commit: an assessment must have components, caps must sum to <= 100, and the stored
-- totals must equal the component sums.
CREATE FUNCTION astig_check_risk_assessment_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  n int; cap_sum numeric; points_sum numeric; known_caps numeric;
BEGIN
  SELECT count(*), coalesce(sum(cap), 0), coalesce(sum(weighted_points), 0),
         coalesce(sum(cap) FILTER (WHERE input_status = 'KNOWN'), 0)
    INTO n, cap_sum, points_sum, known_caps
    FROM risk_score_components WHERE risk_assessment_id = NEW.id;
  IF n = 0 THEN
    RAISE EXCEPTION 'risk assessment % has no components', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  IF cap_sum > 100 THEN
    RAISE EXCEPTION 'risk assessment % component caps sum to % (> 100)', NEW.id, cap_sum USING ERRCODE = 'check_violation';
  END IF;
  IF points_sum <> NEW.total_score OR known_caps <> NEW.known_cap_total THEN
    RAISE EXCEPTION 'risk assessment % totals do not match components', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER risk_assessments_totals_consistent
  AFTER INSERT ON risk_assessments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION astig_check_risk_assessment_totals();

-- ---------------------------------------------------------------------------
-- Work orders (human-approved action) and audit events
-- ---------------------------------------------------------------------------
CREATE TABLE work_orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id                uuid NOT NULL REFERENCES issues (id),
  -- The assessment the officer reviewed; must belong to the same issue.
  risk_assessment_id      uuid NOT NULL,
  idempotency_key         uuid NOT NULL,
  idempotency_fingerprint text NOT NULL CHECK (idempotency_fingerprint ~ '^[0-9a-f]{64}$'),
  status                  text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  assigned_team           text CHECK (char_length(assigned_team) BETWEEN 1 AND 120),
  notes                   text CHECK (char_length(notes) BETWEEN 1 AND 2000),
  created_by_subject      text NOT NULL CHECK (char_length(created_by_subject) BETWEEN 1 AND 200),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  started_at              timestamptz,
  resolved_at             timestamptz,
  version                 integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT work_orders_assessment_matches_issue
    FOREIGN KEY (risk_assessment_id, issue_id) REFERENCES risk_assessments (id, issue_id),
  CONSTRAINT work_orders_idempotency_unique UNIQUE (issue_id, idempotency_key),
  CONSTRAINT work_orders_lifecycle_timestamps CHECK (
    (status = 'OPEN' AND started_at IS NULL AND resolved_at IS NULL)
    OR (status = 'IN_PROGRESS' AND started_at IS NOT NULL AND resolved_at IS NULL)
    OR (status = 'RESOLVED' AND started_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_at >= started_at)
  )
);
-- At most one non-resolved work order per issue.
CREATE UNIQUE INDEX work_orders_one_active_per_issue ON work_orders (issue_id) WHERE status <> 'RESOLVED';
CREATE INDEX work_orders_status_updated_idx ON work_orders (status, updated_at DESC);

-- Defence in depth for the domain rule: OPEN → IN_PROGRESS → RESOLVED; RESOLVED is immutable.
CREATE FUNCTION astig_enforce_work_order_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'work order % is RESOLVED and cannot be modified', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'OPEN' AND NEW.status = 'IN_PROGRESS')
    OR (OLD.status = 'IN_PROGRESS' AND NEW.status = 'RESOLVED')
  ) THEN
    RAISE EXCEPTION 'invalid work order transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.issue_id <> OLD.issue_id OR NEW.risk_assessment_id <> OLD.risk_assessment_id
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.created_by_subject <> OLD.created_by_subject THEN
    RAISE EXCEPTION 'work order % identity fields are immutable', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_orders_enforce_transition
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION astig_enforce_work_order_transition();

CREATE TABLE work_order_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_order_id  uuid NOT NULL REFERENCES work_orders (id),
  event_type     text NOT NULL CHECK (event_type IN ('CREATED', 'STATUS_CHANGED', 'UPDATED')),
  from_status    text CHECK (from_status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  to_status      text CHECK (to_status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  actor_subject  text NOT NULL CHECK (char_length(actor_subject) BETWEEN 1 AND 200),
  -- Names of changed fields only; free-text values are not duplicated into the audit trail.
  changed_fields text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_order_events_work_order_idx ON work_order_events (work_order_id, id);
