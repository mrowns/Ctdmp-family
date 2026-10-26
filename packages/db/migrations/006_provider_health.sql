CREATE TABLE provider_health (
  organization_id text NOT NULL REFERENCES organizations,
  provider_key text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED')),
  last_attempt_at timestamptz NOT NULL,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, provider_key, operation)
);
