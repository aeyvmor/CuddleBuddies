-- 0004_resolution_evidence.sql
-- "After" images attached to a work order (requirement 12). Bytes live in private S3 under a
-- server-derived key; this table stores only the reference and upload state.

CREATE TABLE resolution_evidence (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id           uuid NOT NULL REFERENCES work_orders (id),
  client_evidence_id      uuid NOT NULL,
  idempotency_fingerprint text NOT NULL CHECK (idempotency_fingerprint ~ '^[0-9a-f]{64}$'),
  note                    text CHECK (char_length(note) BETWEEN 1 AND 500),
  image_object_key        text NOT NULL UNIQUE CHECK (char_length(image_object_key) BETWEEN 1 AND 1024),
  content_length_bytes    integer NOT NULL CHECK (content_length_bytes BETWEEN 1 AND 10485760),
  created_by_subject      text NOT NULL CHECK (char_length(created_by_subject) BETWEEN 1 AND 200),
  created_at              timestamptz NOT NULL DEFAULT now(),
  uploaded_at             timestamptz,
  CONSTRAINT resolution_evidence_client_id_unique UNIQUE (work_order_id, client_evidence_id)
);
CREATE INDEX resolution_evidence_work_order_idx ON resolution_evidence (work_order_id, created_at DESC);
