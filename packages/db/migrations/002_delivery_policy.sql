CREATE TABLE templates (id text PRIMARY KEY, purpose text NOT NULL, provider_mode text NOT NULL CHECK(provider_mode='mock'), approved boolean NOT NULL DEFAULT false, version integer NOT NULL);
INSERT INTO templates VALUES ('mock-live-v1','LIVE_START','mock',true,1);
ALTER TABLE notifications ADD COLUMN template_id text NOT NULL DEFAULT 'mock-live-v1' REFERENCES templates;
ALTER TABLE notifications ADD COLUMN provider_mode text NOT NULL DEFAULT 'mock' CHECK(provider_mode='mock');
CREATE TABLE sending_controls (organization_id text PRIMARY KEY REFERENCES organizations, dry_run_enabled boolean NOT NULL DEFAULT true);
INSERT INTO sending_controls SELECT id,true FROM organizations;
ALTER TABLE checkin_events ADD COLUMN last_stream_sequence integer;
ALTER TABLE checkin_events ADD CONSTRAINT last_stream_fk FOREIGN KEY(program_id,last_stream_sequence) REFERENCES stream_versions(program_id,sequence);
