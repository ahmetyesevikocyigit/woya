-- Additive, rerunnable; no fabricated snapshots for historical orders.
CREATE TABLE IF NOT EXISTS woya_store_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), data jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1
);
INSERT INTO woya_store_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE woya_orders ADD COLUMN IF NOT EXISTS legal_snapshot jsonb;
CREATE OR REPLACE FUNCTION woya_protect_legal_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.legal_snapshot IS DISTINCT FROM OLD.legal_snapshot THEN
 RAISE EXCEPTION 'Legal snapshot is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS woya_legal_snapshot_guard ON woya_orders;
CREATE TRIGGER woya_legal_snapshot_guard BEFORE UPDATE ON woya_orders FOR EACH ROW EXECUTE FUNCTION woya_protect_legal_snapshot();
CREATE TABLE IF NOT EXISTS woya_email_outbox (
 id uuid PRIMARY KEY, event_key text UNIQUE NOT NULL, order_id uuid REFERENCES woya_orders(id),
 payload jsonb NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','retry','sent','delivered','failed','unknown','bounced','complained')),
 attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, provider_id text UNIQUE, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS woya_email_outbox_due ON woya_email_outbox(next_attempt_at) WHERE state IN ('queued','retry','sending');
CREATE TABLE IF NOT EXISTS woya_email_events (
 id text PRIMARY KEY, provider_id text NOT NULL, kind text NOT NULL, occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS woya_email_events_provider ON woya_email_events(provider_id);
CREATE TABLE IF NOT EXISTS woya_private_documents (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES woya_orders(id), storage_key text UNIQUE NOT NULL,
 sha256 text NOT NULL, bytes integer NOT NULL CHECK(bytes>0 AND bytes<=10485760), created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL,
 UNIQUE(order_id,sha256)
);
CREATE TABLE IF NOT EXISTS woya_refunds (
 id uuid PRIMARY KEY, submission_id uuid UNIQUE NOT NULL, order_id uuid NOT NULL REFERENCES woya_orders(id),
 amount bigint NOT NULL CHECK(amount>0), provider_reference text UNIQUE NOT NULL, reason text NOT NULL,
 performed_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL
);
CREATE OR REPLACE FUNCTION woya_protect_email_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payload IS DISTINCT FROM OLD.payload OR NEW.event_key IS DISTINCT FROM OLD.event_key THEN
 RAISE EXCEPTION 'Email event payload is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS woya_email_event_guard ON woya_email_outbox;
CREATE TRIGGER woya_email_event_guard BEFORE UPDATE ON woya_email_outbox FOR EACH ROW EXECUTE FUNCTION woya_protect_email_event();
