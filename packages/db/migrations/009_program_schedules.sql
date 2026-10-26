ALTER TABLE programs ADD COLUMN scheduled_start_at timestamptz;
ALTER TABLE programs ADD COLUMN schedule_timezone text;
ALTER TABLE programs ADD CONSTRAINT program_schedule_pair CHECK ((scheduled_start_at IS NULL) = (schedule_timezone IS NULL));
CREATE TABLE program_schedule_history (
  id bigserial PRIMARY KEY,
  program_id text NOT NULL REFERENCES programs,
  actor text NOT NULL REFERENCES members,
  previous_start_at timestamptz,
  previous_timezone text,
  scheduled_start_at timestamptz NOT NULL,
  schedule_timezone text NOT NULL,
  local_date date NOT NULL,
  reason text NOT NULL,
  program_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, program_revision)
);
CREATE INDEX program_schedule_next ON programs(organization_id, scheduled_start_at) WHERE state = 'SCHEDULED' AND scheduled_start_at IS NOT NULL;
