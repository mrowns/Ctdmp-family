CREATE TABLE mock_scenario_requests (
 request_key text PRIMARY KEY,
 actor text NOT NULL REFERENCES members,
 organization_id text NOT NULL REFERENCES organizations,
 program_id text NOT NULL REFERENCES programs,
 request_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,program_id) REFERENCES programs(organization_id,id),
 FOREIGN KEY(organization_id,actor) REFERENCES members(organization_id,id)
);
