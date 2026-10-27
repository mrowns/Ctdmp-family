CREATE TABLE member_usernames (
 member_id text PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 username text NOT NULL,
 normalized_username text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,normalized_username),
 CHECK(username=lower(username)),
 CHECK(username ~ '^[a-z0-9][a-z0-9_]{2,29}$'),
 CHECK(normalized_username=username)
);
CREATE TABLE pending_member_registrations (
 member_id text PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX pending_member_registrations_expiry_idx ON pending_member_registrations(expires_at,member_id);
ALTER TABLE webauthn_challenges DROP CONSTRAINT webauthn_challenges_purpose_check;
ALTER TABLE webauthn_challenges ADD CONSTRAINT webauthn_challenges_purpose_check CHECK(purpose IN ('REGISTRATION','LOGIN','ACCOUNT_CREATION'));
ALTER TABLE webauthn_challenges DROP CONSTRAINT webauthn_challenges_check;
ALTER TABLE webauthn_challenges ADD CONSTRAINT webauthn_challenges_member_purpose_check
 CHECK((purpose IN ('REGISTRATION','ACCOUNT_CREATION') AND member_id IS NOT NULL) OR (purpose='LOGIN' AND member_id IS NULL));
