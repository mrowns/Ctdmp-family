CREATE TABLE webauthn_users (
 member_id text PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 user_handle bytea NOT NULL UNIQUE CHECK(octet_length(user_handle) >= 32),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webauthn_credentials (
 credential_id text PRIMARY KEY,
 management_id text NOT NULL UNIQUE CHECK(length(management_id)=43),
 member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 public_key bytea NOT NULL,
 sign_count bigint NOT NULL DEFAULT 0 CHECK(sign_count >= 0),
 transports text[] NOT NULL DEFAULT '{}',
 device_type text NOT NULL CHECK(device_type IN ('singleDevice','multiDevice')),
 backed_up boolean NOT NULL DEFAULT false,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX webauthn_credentials_member_active_idx ON webauthn_credentials(member_id,created_at) WHERE revoked_at IS NULL;
CREATE TABLE webauthn_challenges (
 id_digest text PRIMARY KEY,
 purpose text NOT NULL CHECK(purpose IN ('REGISTRATION','LOGIN')),
 member_id text REFERENCES members(id) ON DELETE CASCADE,
 browser_digest text NOT NULL,
 challenge text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK((purpose='REGISTRATION' AND member_id IS NOT NULL) OR (purpose='LOGIN' AND member_id IS NULL)),
 CHECK(expires_at > created_at)
);
CREATE INDEX webauthn_challenges_cleanup_idx ON webauthn_challenges(expires_at,id_digest);
CREATE INDEX webauthn_challenges_browser_idx ON webauthn_challenges(browser_digest,purpose,created_at DESC);
CREATE TABLE member_sessions (
 digest text PRIMARY KEY,
 member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 credential_id text REFERENCES webauthn_credentials(credential_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 authenticated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX member_sessions_member_idx ON member_sessions(member_id,created_at DESC);
CREATE TABLE authentication_verifications (
 session_kind text NOT NULL CHECK(session_kind IN ('fixture','member')),
 session_digest text NOT NULL,
 member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_kind,session_digest)
);
INSERT INTO authentication_verifications(session_kind,session_digest,member_id,verified_at)
 SELECT 'fixture',v.session_digest,s.member_id,v.verified_at
 FROM administrative_verifications v JOIN fixture_sessions s ON s.digest=v.session_digest
 ON CONFLICT(session_kind,session_digest) DO NOTHING;
CREATE INDEX authentication_verification_member_idx ON authentication_verifications(member_id,verified_at DESC);
