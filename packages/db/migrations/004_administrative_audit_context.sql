ALTER TABLE audit_logs ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE mock_observations ADD CONSTRAINT observation_program_identity UNIQUE(program_id,id);
ALTER TABLE candidate_decisions ADD CONSTRAINT decision_observation_program FOREIGN KEY(program_id,observation_id) REFERENCES mock_observations(program_id,id);
ALTER TABLE program_transitions ADD CONSTRAINT transition_observation_program FOREIGN KEY(program_id,observation_id) REFERENCES mock_observations(program_id,id);
