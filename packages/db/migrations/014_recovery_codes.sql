CREATE TABLE member_recovery_codes (
 code_digest text PRIMARY KEY CHECK(length(code_digest)=64),
 member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 used_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX member_recovery_codes_member_active_idx ON member_recovery_codes(member_id,created_at) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE TABLE recovery_attempt_buckets (
 browser_digest text PRIMARY KEY CHECK(length(browser_digest)=64),
 window_started_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL CHECK(attempts>=1)
);
CREATE INDEX recovery_attempt_buckets_cleanup_idx ON recovery_attempt_buckets(window_started_at,browser_digest);
