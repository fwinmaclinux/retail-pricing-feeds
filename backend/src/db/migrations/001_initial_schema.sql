-- Pricing Feed Platform - initial schema.
--
-- Production note: price_record is declared as
--   PARTITION BY LIST (country_code) with sub-partitions BY RANGE (effective_date) (monthly)
-- in each regional cell, so that retention/archival is a partition drop and country-scoped
-- queries prune partitions. The local schema keeps a single table so it runs on PGlite.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE store (
  store_id      text PRIMARY KEY,
  name          text NOT NULL,
  country_code  char(2) NOT NULL,
  currency      char(3) NOT NULL,
  timezone      text NOT NULL,
  region        text NOT NULL,           -- data-residency cell: EU, APAC, NA, MEA
  active        boolean NOT NULL DEFAULT true
);
CREATE INDEX store_country_idx ON store (country_code);

CREATE TABLE price_feed (
  feed_id          uuid PRIMARY KEY,
  file_name        text NOT NULL,
  size_bytes       bigint,
  checksum_sha256  text,
  uploaded_by      text NOT NULL,
  uploader_scope   jsonb NOT NULL,          -- entitlements at upload time; the worker validates rows against it
  status           text NOT NULL CHECK (status IN
                     ('AWAITING_UPLOAD','QUEUED','PROCESSING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED')),
  blob_key         text,
  total_rows       integer NOT NULL DEFAULT 0,
  inserted_rows    integer NOT NULL DEFAULT 0,
  updated_rows     integer NOT NULL DEFAULT 0,
  unchanged_rows   integer NOT NULL DEFAULT 0,
  rejected_rows    integer NOT NULL DEFAULT 0,
  failure_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);
CREATE INDEX price_feed_uploader_idx ON price_feed (uploaded_by, created_at DESC);
-- Idempotent uploads: the same file (by content hash) from the same user is accepted once.
CREATE UNIQUE INDEX price_feed_dedupe_idx ON price_feed (uploaded_by, checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL AND status <> 'FAILED';

CREATE TABLE price_feed_error (
  feed_id     uuid NOT NULL REFERENCES price_feed (feed_id) ON DELETE CASCADE,
  row_number  integer NOT NULL,
  raw_row     text,
  messages    jsonb NOT NULL,
  PRIMARY KEY (feed_id, row_number)
);

CREATE TABLE price_record (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id        text NOT NULL REFERENCES store (store_id),
  sku             text NOT NULL,
  product_name    text NOT NULL,
  price           numeric(14, 4) NOT NULL CHECK (price >= 0),
  currency        char(3) NOT NULL,
  effective_date  date NOT NULL,
  country_code    char(2) NOT NULL,
  version         integer NOT NULL DEFAULT 1,
  source_feed_id  uuid REFERENCES price_feed (feed_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text NOT NULL,
  CONSTRAINT price_record_natural_key UNIQUE (store_id, sku, effective_date)
);
-- Access paths used by the search API (all searches are scoped by store or country).
CREATE INDEX price_record_sku_idx           ON price_record (sku, effective_date DESC);
CREATE INDEX price_record_country_date_idx  ON price_record (country_code, effective_date DESC, id DESC);
CREATE INDEX price_record_store_date_idx    ON price_record (store_id, effective_date DESC, id DESC);
CREATE INDEX price_record_name_trgm_idx     ON price_record USING gin (product_name gin_trgm_ops);

-- Append-only change history: who changed what, when, and why (feed or manual edit).
CREATE TABLE price_record_audit (
  audit_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  price_record_id  bigint NOT NULL REFERENCES price_record (id),
  action           text NOT NULL CHECK (action IN ('CREATED','FEED_UPDATE','MANUAL_EDIT')),
  version          integer NOT NULL,
  old_values       jsonb,
  new_values       jsonb NOT NULL,
  changed_by       text NOT NULL,
  change_reason    text,
  source_feed_id   uuid,
  changed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_record_audit_record_idx ON price_record_audit (price_record_id, audit_id DESC);
