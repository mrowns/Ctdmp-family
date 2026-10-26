ALTER TABLE notifications ADD COLUMN join_link_digest text REFERENCES join_links(digest);
ALTER TABLE notifications ADD COLUMN payload_expires_at timestamptz;
UPDATE notifications SET payload_expires_at=expires_at WHERE payload_cipher IS NOT NULL;
ALTER TABLE notifications ADD CONSTRAINT notification_payload_expiry_pair CHECK ((payload_cipher IS NULL) = (payload_expires_at IS NULL));
CREATE INDEX join_nonces_cleanup_idx ON join_nonces(expires_at,digest);
CREATE INDEX join_links_cleanup_idx ON join_links(expires_at,digest);
CREATE INDEX notification_payload_cleanup_idx ON notifications(expires_at,id) WHERE payload_cipher IS NOT NULL;
