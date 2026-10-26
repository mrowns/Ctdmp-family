CREATE TABLE administrative_verifications (
 session_digest text PRIMARY KEY REFERENCES fixture_sessions(digest) ON DELETE CASCADE,
 verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE program_selections (
 organization_id text PRIMARY KEY REFERENCES organizations,
 program_id text NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK(revision >= 0),
 FOREIGN KEY(organization_id,program_id) REFERENCES programs(organization_id,id)
);
CREATE TABLE program_transitions (
 id bigserial PRIMARY KEY,
 program_id text NOT NULL REFERENCES programs,
 previous_state text NOT NULL,
 next_state text NOT NULL,
 revision integer NOT NULL,
 actor text REFERENCES members,
 observation_id bigint REFERENCES mock_observations,
 reason text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(program_id,revision)
);
CREATE TABLE candidate_decisions (
 id bigserial PRIMARY KEY,
 program_id text NOT NULL REFERENCES programs,
 observation_id bigint NOT NULL REFERENCES mock_observations,
 video_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
 actor text NOT NULL REFERENCES members,
 reason text NOT NULL,
 program_revision integer NOT NULL,
 evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidate_decision_latest ON candidate_decisions(program_id,video_id,id DESC);
ALTER TABLE sending_controls ADD COLUMN revision integer NOT NULL DEFAULT 0;
