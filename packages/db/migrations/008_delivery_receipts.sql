ALTER TABLE webhook_inbox ADD COLUMN processed_at timestamptz;
ALTER TABLE webhook_inbox ADD COLUMN processing_error text;
ALTER TABLE notifications ADD COLUMN provider_message_id text;
ALTER TABLE notifications ADD COLUMN provider_status text CHECK (provider_status IN ('SENT', 'FAILED_FINAL', 'DELIVERED', 'READ_OBSERVED'));
ALTER TABLE notifications ADD COLUMN provider_status_at timestamptz;
CREATE UNIQUE INDEX notification_provider_message_id ON notifications(organization_id, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE TABLE provider_receipts (
  event_key text PRIMARY KEY REFERENCES webhook_inbox(event_key),
  organization_id text NOT NULL REFERENCES organizations,
  provider_key text NOT NULL,
  provider_message_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('SENT', 'FAILED_FINAL', 'DELIVERED', 'READ_OBSERVED')),
  provider_event_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  notification_id bigint REFERENCES notifications,
  reconciliation_status text NOT NULL CHECK (reconciliation_status IN ('UNMATCHED', 'MATCHED')),
  safe_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((reconciliation_status = 'UNMATCHED' AND notification_id IS NULL) OR (reconciliation_status = 'MATCHED' AND notification_id IS NOT NULL))
);
CREATE INDEX provider_receipts_unmatched ON provider_receipts(organization_id, provider_message_id) WHERE reconciliation_status = 'UNMATCHED';
CREATE INDEX provider_receipts_recent ON provider_receipts(organization_id, received_at DESC);
