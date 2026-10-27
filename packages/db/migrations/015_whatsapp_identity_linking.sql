CREATE TABLE whatsapp_link_challenges (
 challenge_digest text PRIMARY KEY CHECK(length(challenge_digest)=64),
 organization_id text NOT NULL,
 member_id text NOT NULL,
 browser_digest text NOT NULL CHECK(length(browser_digest)=64),
 phone_digest text NOT NULL CHECK(length(phone_digest)=64),
 encrypted_destination text NOT NULL,
 code_digest text NOT NULL CHECK(length(code_digest)=64),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 FOREIGN KEY (organization_id,member_id) REFERENCES members(organization_id,id) ON DELETE CASCADE,
 CHECK(expires_at>created_at)
);
CREATE INDEX whatsapp_link_challenges_member_idx ON whatsapp_link_challenges(member_id,created_at DESC);
CREATE INDEX whatsapp_link_challenges_cleanup_idx ON whatsapp_link_challenges(expires_at,challenge_digest);
CREATE TABLE linked_whatsapp_identities (
 id text PRIMARY KEY CHECK(length(id)=43),
 organization_id text NOT NULL,
 member_id text NOT NULL,
 provider_key text NOT NULL CHECK(provider_key IN ('mock-whatsapp')),
 identity_digest text NOT NULL CHECK(length(identity_digest)=64),
 encrypted_destination text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (organization_id,member_id) REFERENCES members(organization_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX linked_whatsapp_identity_owner_active_idx ON linked_whatsapp_identities(organization_id,provider_key,identity_digest) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX linked_whatsapp_member_active_idx ON linked_whatsapp_identities(organization_id,member_id,provider_key) WHERE revoked_at IS NULL;
CREATE INDEX linked_whatsapp_member_history_idx ON linked_whatsapp_identities(member_id,created_at DESC);
