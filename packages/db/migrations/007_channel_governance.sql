ALTER TABLE official_channels ADD CONSTRAINT official_channels_scope_unique UNIQUE (organization_id, program_id, id);
CREATE TABLE channel_approval_history (
  id bigserial PRIMARY KEY,
  organization_id text NOT NULL,
  program_id text NOT NULL,
  channel_id text NOT NULL,
  actor text NOT NULL,
  previous_approved boolean NOT NULL,
  approved boolean NOT NULL,
  reason text NOT NULL,
  program_revision integer NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_approved <> approved),
  FOREIGN KEY (organization_id, program_id) REFERENCES programs(organization_id, id),
  FOREIGN KEY (organization_id, program_id, channel_id) REFERENCES official_channels(organization_id, program_id, id),
  FOREIGN KEY (organization_id, actor) REFERENCES members(organization_id, id)
);
CREATE INDEX channel_approval_history_scope ON channel_approval_history(program_id, channel_id, id DESC);
